// TODO more strategies
// TODO separate update strategy from application
// TODO just use brew?

import os from 'node:os'
import { z } from 'zod'
import { ITSON_TASK_NAME } from './constants.ts'
import { cronToPlistFragment } from './utilities/cron-to-launchd.ts'

/**
 * Expand a leading `~` to the current user's home directory, the way a shell
 * would. Also expands a `~` that directly follows `=`, so `--flag=~/path` style
 * arguments work. Values without a tilde prefix are returned unchanged.
 *
 * @param value The path or argument to expand.
 *
 * @returns The value with tildes expanded.
 */
export function expandTilde(value: string): string {
	return value.replaceAll(
		/(^|=)~(?=\/|$)/gv,
		(_match, prefix: string) => `${prefix}${os.homedir()}`,
	)
}

/**
 * A local path or command argument. A leading `~` (or `~` directly after `=`)
 * is expanded to the home directory at load time.
 */
const localPathSchema = z.string().transform((value) => expandTilde(value))

/**
 * Compile a regular expression from a source string, reporting failures as
 * validation issues instead of throwing.
 */
function compileRegex(source: string, flags: string | undefined, context: z.RefinementCtx): RegExp {
	try {
		return new RegExp(source, flags)
	} catch (error) {
		context.addIssue({
			code: 'custom',
			message: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
		})
		return z.NEVER
	}
}

/**
 * A regular expression, accepted as a `RegExp` instance (JS and TS configs), a
 * pattern source string, or a `{ source, flags }` object (JSON configs).
 */
const regexPatternSchema = z
	.union([
		z.instanceof(RegExp),
		z.string(),
		z.object({
			flags: z.string().optional(),
			source: z.string(),
		}),
	])
	.transform((value, context) => {
		if (value instanceof RegExp) {
			return value
		}

		if (typeof value === 'string') {
			return compileRegex(value, undefined, context)
		}

		return compileRegex(value.source, value.flags, context)
	})

const itsonUpdateStrategyGitHubSchema = z.object({
	artifactPattern: regexPatternSchema.describe(
		'Pattern matching the name of the release artifact to download.',
	),
	destination: localPathSchema.describe(
		'Where to install the downloaded artifact. A leading `~` is expanded to the home directory.',
	),
	owner: z.string(),
	repo: z.string(),
	type: z.literal('github'),
	version: z.string().optional().describe('If not provided, the latest version will be used.'),
})

const itsonUpdateStrategyGitHubPythonSchema = z.object({
	owner: z.string(),
	repo: z.string(),
	type: z.literal('github-python'),
	version: z.string().optional().describe('If not provided, the latest version will be used.'),
})

const itsonLogUploadStrategyS3Schema = z.object({
	bucketName: z.string(),
	endpoint: z.string(),
	ignorePatterns: z
		.array(z.string())
		.optional()
		.describe(
			'Minimatch patterns to ignore when uploading logs. These are applied in addition to a default set of common patterns.',
		),
	localPath: localPathSchema.describe(
		'Local directory to upload logs from. A leading `~` is expanded to the home directory.',
	),
	remotePath: z.string().optional(),
	type: z.literal('s3'),
})

/**
 * The name doubles as the launchd label suffix and the plist file name, so it
 * can't be blank or contain a path separator.
 */
const nameSchema = z
	.string()
	.trim()
	.min(1, 'A name is required.')
	.refine((value) => !value.includes('/'), 'Names must not contain "/".')
	.describe('Unique name for the application or task, used to label its launchd service.')

/**
 * Report duplicate names within a list of applications or tasks.
 */
function addDuplicateNameIssues(
	items: Array<{ name: string }>,
	path: 'applications' | 'tasks',
	context: z.RefinementCtx,
) {
	const seen = new Set<string>()
	for (const [index, item] of items.entries()) {
		if (seen.has(item.name)) {
			context.addIssue({
				code: 'custom',
				message: `Duplicate ${path === 'tasks' ? 'task' : 'application'} name "${item.name}". Names must be unique.`,
				path: [path, index, 'name'],
			})
		}

		seen.add(item.name)
	}
}

const itsonConfigBaseSchema = z.object({
	name: nameSchema,
	command: localPathSchema.describe(
		'Executable to run, either a name on the PATH or a path. A leading `~` is expanded to the home directory.',
	),
	arguments: z
		.array(localPathSchema)
		.optional()
		.describe(
			'Arguments passed to the command. A leading `~`, or `~` directly after `=` (as in `--flag=~/path`), is expanded to the home directory.',
		),
	logUpload: itsonLogUploadStrategyS3Schema.optional(),
	update: z
		.discriminatedUnion('type', [
			itsonUpdateStrategyGitHubSchema,
			itsonUpdateStrategyGitHubPythonSchema,
		])
		.optional(),
})

const itsonConfigTaskSchema = itsonConfigBaseSchema.extend({
	schedule: z
		.string()
		.superRefine((value, context) => {
			// Fail at config load with the same clear error as any other config
			// mistake, rather than when the task is registered with launchd
			try {
				cronToPlistFragment(value)
			} catch (error) {
				context.addIssue({
					code: 'custom',
					message: `Unsupported schedule "${value}": ${error instanceof Error ? error.message : String(error)}`,
				})
			}
		})
		.describe(
			'Schedule to run the task at specified times or at `@reboot` (system startup). Uses cron syntax (with some edge-case limitations). Uses local time, not UTC.',
		),
})

const itsonConfigAppSchema = itsonConfigBaseSchema.extend({
	schedule: z
		.never()
		.optional()
		.describe('Applications must not define a schedule. Use a task instead.'),
})

/**
 * Schema for the itson configuration file. The single source of truth for the
 * configuration types, the generated JSON Schema, and load-time validation.
 *
 * @public
 */
export const itsonConfigSchema = z
	.object({
		applications: z
			.array(itsonConfigAppSchema)
			.default([])
			.describe('Applications to manage and keep running persistently.'),
		offline: z
			.boolean()
			.default(false)
			.describe("Don't wait around for internet access, skip operations that require it."),
		runOnStartup: z.boolean().default(false).describe('Register itson to run on startup.'),
		tasks: z
			.array(itsonConfigTaskSchema)
			.default([])
			.describe('One-off tasks to run at specified times.'),
		verbose: z.boolean().default(false).describe('Run with verbose logging.'),
	})
	.superRefine((config, context) => {
		// Applications and tasks get distinct launchd label prefixes, so a name
		// only has to be unique within its own list
		addDuplicateNameIssues(config.applications, 'applications', context)
		addDuplicateNameIssues(config.tasks, 'tasks', context)

		const reservedIndex = config.tasks.findIndex((task) => task.name === ITSON_TASK_NAME)
		if (reservedIndex !== -1) {
			context.addIssue({
				code: 'custom',
				message: `The task name "${ITSON_TASK_NAME}" is reserved for itson's own startup task.`,
				path: ['tasks', reservedIndex, 'name'],
			})
		}
	})

/**
 * The validated and normalized itson configuration, as used internally.
 * Defaults are populated and `artifactPattern` values are always `RegExp`.
 *
 * @public
 */
export type ItsonConfig = z.output<typeof itsonConfigSchema>

/**
 * The itson configuration as authored in a config file, before validation.
 * Defaults may be omitted and `artifactPattern` values may be a `RegExp`, a
 * pattern source string, or a `{ source, flags }` object.
 *
 * @public
 */
export type ItsonConfigInput = z.input<typeof itsonConfigSchema>

/**
 * A validated application configuration.
 *
 * @public
 */
export type ItsonConfigApp = z.output<typeof itsonConfigAppSchema>

/**
 * A validated task configuration.
 *
 * @public
 */
export type ItsonConfigTask = z.output<typeof itsonConfigTaskSchema>

/**
 * A validated S3 log upload strategy configuration.
 *
 * @public
 */
export type ItsonLogUploadStrategyS3 = z.output<typeof itsonLogUploadStrategyS3Schema>

/**
 * A validated GitHub release update strategy configuration.
 *
 * @public
 */
export type ItsonUpdateStrategyGitHub = z.output<typeof itsonUpdateStrategyGitHubSchema>

/**
 * A validated GitHub Python release update strategy configuration.
 *
 * @public
 */
export type ItsonUpdateStrategyGitHubPython = z.output<typeof itsonUpdateStrategyGitHubPythonSchema>

/**
 * Type guard to check if an application is a task.
 *
 * @public
 */
export function isTask(app: ItsonConfigApp | ItsonConfigTask): boolean {
	return typeof app.schedule === 'string'
}

/**
 * Type guard to check if an application is an application.
 */
export function isApp(app: ItsonConfigApp | ItsonConfigTask): boolean {
	return typeof app.schedule !== 'string'
}

/**
 * The default itson configuration, as produced by the schema's defaults.
 */
export const DEFAULT_ITSON_CONFIG = itsonConfigSchema.parse({})

/**
 * Itson configuration factory function for type safety.
 *
 * @public
 */
export function itsonConfig(config: ItsonConfigInput): ItsonConfigInput {
	return config
}
