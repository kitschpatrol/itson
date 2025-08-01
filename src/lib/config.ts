/**
 * TODO more strategies
 * @public
 */
export type ItsonUpdateStrategyGitHub = {
	destination: string
	namePattern: RegExp
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
	updates?: ItsonUpdateStrategyGitHub
}

/**
 * @public
 */
export type ItsonConfig = {
	applications: ItsonConfigApplication[]
	// TODO more stuff
	runOnStartup: boolean
}
