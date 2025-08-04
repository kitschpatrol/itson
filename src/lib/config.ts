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
}

/**
 *
 * @public
 */
export type ItsonUpdateStrategyGitHubPython = {
	owner: string
	repo: string
	type: 'github-python'
}

/**
 * @public
 */
export type ItsonConfigApplication = {
	arguments?: string[]
	command: string
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
