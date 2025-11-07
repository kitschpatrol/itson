// TODO more strategies
// TODO separate update strategy from application
// TODO just use brew?

/**
 *
 * @public
 */
export type ItsonUpdateStrategyGitHub = {
	artifactPattern: RegExp
	destination: string
	owner: string
	repo: string
	type: 'github'
	/** If not provided, the latest version will be used. */
	version?: string
}

/**
 *
 * @public
 */
export type ItsonUpdateStrategyGitHubPython = {
	owner: string
	repo: string
	type: 'github-python'
	/** If not provided, the latest version will be used. */
	version?: string
}

/**
 * Itson log upload strategy
 * @public
 */
export type ItsonLogUploadStrategyS3 = {
	bucketName: string
	endpoint: string
	/**
	 * Minimatch patterns to ignore when uploading logs. These are applied in addition to a default set of common patterns.
	 */
	ignorePatterns?: string[]
	localPath: string
	remotePath?: string
	type: 's3'
}

/**
 * Base task configuration, specialized into schedule task and application task
 * configurations.
 */
export type ItsonConfigTask = {
	arguments?: string[]
	command: string
	name: string
}

export type ItsonConfigScheduledTask = ItsonConfigTask & {
	schedule: string
}

/**
 * @public
 */
export type ItsonConfigApplication = ItsonConfigTask & {
	logUpload?: ItsonLogUploadStrategyS3
	update?: ItsonUpdateStrategyGitHub | ItsonUpdateStrategyGitHubPython
}

export const DEFAULT_ITSON_CONFIG = {
	applications: [],
	offline: false,
	runOnStartup: false,
	verbose: false,
}

/**
 * @public
 */
export type ItsonConfig = {
	/**
	 * Applications to manage and keep running persistently.
	 * @default []
	 */
	applications: ItsonConfigApplication[]
	/**
	 * Don't wait around for internet access, skip operations that require it.
	 * @default false
	 */
	offline: boolean
	/**
	 * Register itson to run on startup.
	 * @default false
	 */
	runOnStartup: boolean
	/**
	 * Scheduled tasks to run at specified times.
	 * @default []
	 */
	scheduledTasks: ItsonConfigScheduledTask[]
	/**
	 * Run with verbose logging.
	 * @default false
	 */
	verbose: boolean
}

/**
 * Itson configuration factory function for type safety.
 * @public
 */
export function itsonConfig(config: ItsonConfig): ItsonConfig {
	return config
}
