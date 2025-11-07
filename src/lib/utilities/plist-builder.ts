/* eslint-disable ts/naming-convention */
import path from 'node:path'
import plist from 'plist'
import { cronToPlistFragment } from './cron-to-launchd'

/**
 * Create a launchd plist for a long-running application.
 */
export function createApplicationPlist(options: {
	arguments?: string[]
	command: string
	keepAlive: boolean
	label: string
	logDirectoryPath: string
	schedule?: string
	userPath: string
}): string {
	console.log(options)

	return plist.build(
		/* eslint-disable perfectionist/sort-objects */
		{
			Label: options.label,
			ProgramArguments: ['/usr/bin/env', options.command, ...(options.arguments ?? [])],
			EnvironmentVariables: {
				PATH: options.userPath,
				NODE_ENV: 'production',
			},
			...(options.schedule
				? {
						...cronToPlistFragment(options.schedule),
					}
				: { RunAtLoad: false }),
			KeepAlive: options.keepAlive
				? {
						SuccessfulExit: true,
						Crashed: true,
						AfterInitialDemand: true,
					}
				: false,
			SessionCreate: false,
			LimitLoadToSessionType: 'Aqua',
			StandardOutPath: path.join(options.logDirectoryPath, `${options.label}.out.log`),
			StandardErrorPath: path.join(options.logDirectoryPath, `${options.label}.err.log`),
		},
		/* eslint-enable perfectionist/sort-objects */
	)
}

//
// console.log(
// 	createApplicationPlist({
// 		arguments: [],
// 		command: 'echo',
// 		keepAlive: true,
// 		label: 'test',
// 		logDirectoryPath: '/tmp',
// 		schedule: '0 0 * * *',
// 		userPath: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
// 	}),
// )
