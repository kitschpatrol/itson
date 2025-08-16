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
 * @public
 */
export type ItsonConfigApplication = {
	arguments?: string[]
	command: string
	logUpload?: ItsonLogUploadStrategyS3
	name: string
	update?: ItsonUpdateStrategyGitHub | ItsonUpdateStrategyGitHubPython
}

/**
 * @public
 */
export type ItsonConfig = {
	applications: ItsonConfigApplication[]
	// TODO more stuff
	runOnStartup: boolean
}

/**
 * Itson configuration factory function for type safety.
 * @public
 */
export function itsonConfig(config: ItsonConfig): ItsonConfig {
	return config
}
