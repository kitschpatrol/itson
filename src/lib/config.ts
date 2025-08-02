/**
 * TODO more strategies
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
 * @public
 */
export type ItsupConfigApplication = {
	command: string
	name: string
	update?: ItsupUpdateStrategyGitHub
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
