// TODO more strategies
// TODO separate update strategy from application
// TODO just use brew?

import { z } from 'zod'

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
	destination: z.string(),
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
	localPath: z.string(),
	remotePath: z.string().optional(),
	type: z.literal('s3'),
})

const itsonConfigBaseSchema = z.object({
	name: z.string(),
	command: z.string(),
	arguments: z.array(z.string()).optional(),
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
export const itsonConfigSchema = z.object({
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
