/* eslint-disable ts/naming-convention */
import os from 'node:os'
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
	logDirectoryPath?: string
	schedule?: string
	userPath: string
}): string {
	console.log(options)

	const logDirectoryPathResolved =
		options.logDirectoryPath ?? path.join(os.homedir(), 'Library', 'Logs')

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
			StandardOutPath: path.join(logDirectoryPathResolved, `${options.label}.out.log`),
			StandardErrorPath: path.join(logDirectoryPathResolved, `${options.label}.err.log`),
		},
		/* eslint-enable perfectionist/sort-objects */
	)
}
