/**
 * TODO more strategies
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
 * @public
 */
export type ItsonConfigApplication = {
	command: string
	name: string
	update?: ItsonUpdateStrategyGitHub
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
