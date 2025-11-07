// TODO more strategies
// TODO separate update strategy from application
// TODO just use brew?

import type { Simplify } from 'type-fest'

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

type ItsonConfigBase = {
	arguments?: string[]
	command: string
	logUpload?: ItsonLogUploadStrategyS3
	name: string
	update?: ItsonUpdateStrategyGitHub | ItsonUpdateStrategyGitHubPython
}

export type ItsonConfigTask = Simplify<
	ItsonConfigBase & {
		/**
		 * Set this to run one-off tasks instead of a persistent application.
		 * Schedule to run the application at specified times or at `@reboot` (system startup).
		 * If undefined, the application will run when itson is launched and be kept alive.
		 * Uses cron syntax (with some edge-case limitations)
		 * @default undefined
		 */
		schedule: string
	}
>

/**
 * Type guard to check if an application is a task.
 * @public
 */
export function isTask(application: ItsonConfigApplication | ItsonConfigTask): boolean {
	return typeof application.schedule === 'string'
}

/**
 * Type guard to check if an application is an application.
 */
export function isApplication(application: ItsonConfigApplication | ItsonConfigTask): boolean {
	return typeof application.schedule !== 'string'
}

/**
 * @public
 */
export type ItsonConfigApplication = Simplify<
	ItsonConfigBase & {
		schedule: never
	}
>

export const DEFAULT_ITSON_CONFIG = {
	applications: [],
	offline: false,
	runOnStartup: false,
	tasks: [],
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
	 * One-off tasks to run at specified times.
	 * @default []
	 */
	tasks: ItsonConfigTask[]
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
