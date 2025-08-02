// TODO more strategies
// TODO separate update strategy from application
// TODO just use brew?

/**
 *
 * @public
 */
export type ItsupUpdateStrategyGitHub = {
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
export type ItsupUpdateStrategyGitHubPython = {
	cli: string
	owner: string
	repo: string
	type: 'github-python'
}

/**
 * @public
 */
export type ItsupConfigApplication = {
	arguments?: string[]
	command: string
	name: string
	update?: ItsupUpdateStrategyGitHub | ItsupUpdateStrategyGitHubPython
}

/**
 * @public
 */
export type ItsupConfig = {
	applications: ItsupConfigApplication[]
	// TODO more stuff
	runOnStartup: boolean
}

/**
 * Itsup configuration factory function for type safety.
 * @public
 */
export function itsupConfig(config: ItsupConfig): ItsupConfig {
	return config
}
