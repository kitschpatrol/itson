// Maintained by hand in itson's src/assets/itson.d.ts alongside the zod schema
// in src/lib/config.ts — not generated from it, because no generation route
// (declaration emit, .d.ts bundling, structural type expansion) yields a
// dependency-free file that keeps these JSDoc descriptions. Structural drift
// against the schema fails type checking via the assertions in
// test/config-types.test.ts, so only prose can fall out of sync. Mirror schema
// changes here, including `.describe()` text. This comment block is stripped
// from the published copy by scripts/build-assets.ts.

/**
 * Type definitions for the itson configuration file.
 *
 * Annotate your config to get type checking and autocomplete in your editor:
 *
 * ```ts
 * export default {
 * 	applications: [],
 * 	tasks: [],
 * } satisfies import('./.itson/itson.js').ItsonConfig
 * ```
 */

/**
 * A regular expression, as a `RegExp` instance (JS and TS configs), a pattern
 * source string, or a `{ source, flags }` object (JSON configs).
 */
export type RegexPattern = RegExp | string | { flags?: string; source: string }

/**
 * Update an app or task from binary artifacts attached to a GitHub release.
 */
export type ItsonUpdateStrategyGitHub = {
	/** Pattern matching the name of the release artifact to download. */
	artifactPattern: RegexPattern
	destination: string
	owner: string
	repo: string
	type: 'github'
	/** If not provided, the latest version will be used. */
	version?: string
}

/**
 * Update an app or task from a Python application package in a GitHub release.
 */
export type ItsonUpdateStrategyGitHubPython = {
	owner: string
	repo: string
	type: 'github-python'
	/** If not provided, the latest version will be used. */
	version?: string
}

/**
 * Upload logs to an S3-compatible bucket.
 */
export type ItsonLogUploadStrategyS3 = {
	bucketName: string
	endpoint: string
	/**
	 * Minimatch patterns to ignore when uploading logs. These are applied in
	 * addition to a default set of common patterns.
	 */
	ignorePatterns?: string[]
	localPath: string
	remotePath?: string
	type: 's3'
}

/**
 * An application to manage and keep running persistently.
 */
export type ItsonConfigApp = {
	name: string
	command: string
	arguments?: string[]
	logUpload?: ItsonLogUploadStrategyS3
	/** Applications must not define a schedule. Use a task instead. */
	schedule?: never
	update?: ItsonUpdateStrategyGitHub | ItsonUpdateStrategyGitHubPython
}

/**
 * A one-off task to run at specified times.
 */
export type ItsonConfigTask = {
	name: string
	command: string
	arguments?: string[]
	logUpload?: ItsonLogUploadStrategyS3
	/**
	 * Schedule to run the task at specified times or at `@reboot` (system
	 * startup). Uses cron syntax (with some edge-case limitations). Uses local
	 * time, not UTC.
	 */
	schedule: string
	update?: ItsonUpdateStrategyGitHub | ItsonUpdateStrategyGitHubPython
}

/**
 * The itson configuration file.
 */
export type ItsonConfig = {
	/**
	 * Applications to manage and keep running persistently.
	 *
	 * @default [ ]
	 */
	applications?: ItsonConfigApp[]
	/**
	 * Don't wait around for internet access, skip operations that require it.
	 *
	 * @default false
	 */
	offline?: boolean
	/**
	 * Register itson to run on startup.
	 *
	 * @default false
	 */
	runOnStartup?: boolean
	/**
	 * One-off tasks to run at specified times.
	 *
	 * @default [ ]
	 */
	tasks?: ItsonConfigTask[]
	/**
	 * Run with verbose logging.
	 *
	 * @default false
	 */
	verbose?: boolean
}
