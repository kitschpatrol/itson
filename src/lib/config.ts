/**
 * @public
 */
export type ItsonConfigApplication = {
	destination: string
	name: string
	namePattern: RegExp
	owner: string
	repo: string
	type: 'github'
}

/**
 * @public
 */
export type ItsonConfig = {
	applications: ItsonConfigApplication[]
	// TODO more stuff
	runOnStartup: boolean
}
