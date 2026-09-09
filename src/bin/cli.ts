#!/usr/bin/env node

import { loadConfig } from 'c12'
import { getJsonFileTransportDestinations, log, setDefaultLogOptions } from 'lognow'
import os from 'node:os'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { z } from 'zod'
import type { ItsonConfigInput } from '../lib/config'
import { name, version } from '../../package.json'
import { editConfig } from '../lib/commands/config'
import { uploadAllLogs } from '../lib/commands/log-upload'
import { register } from '../lib/commands/register'
import { reset } from '../lib/commands/reset'
import { startAllApps } from '../lib/commands/start'
import { stopAllApps } from '../lib/commands/stop'
import { updateAllAppsAndTasks } from '../lib/commands/update'
import { DEFAULT_ITSON_CONFIG, itsonConfigSchema } from '../lib/config'

setDefaultLogOptions({ logJsonToFile: true, name })

// Config
// `_configFile` is the path c12 actually loaded, `configFile` is just the
// name it searched for and is set even when nothing was found
let configFile: string | undefined
let rawConfig: ItsonConfigInput = {}
let configLoadError: Error | undefined

try {
	const loaded = await loadConfig<ItsonConfigInput>({
		cwd: os.homedir(), // Rcfile search in home dir doesn't seem to work...
		defaultConfig: DEFAULT_ITSON_CONFIG,
		globalRc: true,
		name: 'itson',
	})
	configFile = loaded._configFile
	rawConfig = loaded.config
} catch (error) {
	// A config file that fails to parse still has to be openable with `itson
	// config`, so hold on to the failure until the command is known
	configLoadError = error instanceof Error ? error : new Error(String(error))
}

const parsedConfig = itsonConfigSchema.safeParse(rawConfig)

// The fallback lets logging start up before the middleware reports the problem,
// which exits every command but `config`. It's parsed fresh rather than shared
// with `DEFAULT_ITSON_CONFIG`, since the middleware writes to it.
const config = parsedConfig.success ? parsedConfig.data : itsonConfigSchema.parse({})

/**
 * Report a problem with the config file. Fatal everywhere except in the
 * `config` command, since opening the file is how these get fixed.
 */
function reportConfigProblem(message: string, isConfigCommand: boolean): void {
	if (isConfigCommand) {
		log.warn(message)
		return
	}

	log.error(message)
	process.exit(1)
}

/**
 * Run one phase of a multi-step command, logging failures instead of letting
 * them abort the remaining phases. Getting the applications running matters
 * more than any single update or upload succeeding.
 */
async function runPhase(description: string, phase: () => Promise<void>): Promise<void> {
	try {
		await phase()
	} catch (error) {
		log.withError(error).error(`${description} failed, continuing:`)
	}
}

const yargsInstance = yargs(hideBin(process.argv))

// Yes
await yargsInstance
	.scriptName('itson')
	.usage('$0 [command]', 'Run an itson command.')
	.option('verbose', {
		description: 'Run with verbose logging. Overrides the config file.',
		type: 'boolean',
	})
	.option('offline', {
		description: 'Skip operations that require internet access. Overrides the config file.',
		type: 'boolean',
	})
	.middleware((argv) => {
		// Override config file values with command line options
		if (argv.offline !== undefined) {
			config.offline = argv.offline
		}

		if (argv.verbose !== undefined) {
			config.verbose = argv.verbose
		}

		// Set console level globally based on the resolved verbose setting
		setDefaultLogOptions({ verbose: config.verbose })

		log.debug('Verbose logging enabled')
		log.debug(`Logging to file: "${getJsonFileTransportDestinations().at(0)}"`)
		log.withMetadata({ config }).debug('Loaded config:')

		const isConfigCommand = argv._.at(0) === 'config'

		if (configLoadError !== undefined) {
			reportConfigProblem(
				`Could not load itson configuration: ${configLoadError.message}`,
				isConfigCommand,
			)
		} else if (!parsedConfig.success) {
			reportConfigProblem(
				`Invalid itson configuration${configFile === undefined ? '' : ` at "${configFile}"`}:\n${z.prettifyError(parsedConfig.error)}`,
				isConfigCommand,
			)
		} else if (configFile === undefined && !isConfigCommand) {
			log.warn('No itson config file found. Run "itson config" to create one.')
		}
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {
			/* Empty */
		},
		async () => {
			if (configFile !== undefined) {
				log.info(`Using itson config file at "${configFile}"`)
			}

			log.info('Launching itson')

			await runPhase('Registration', async () => register(config))
			await runPhase('Update', async () => updateAllAppsAndTasks(config))
			// Upload before starting, so logs from the previous session are
			// captured before an app has a chance to rotate or truncate them
			await runPhase('Log upload', async () => uploadAllLogs(config))
			await startAllApps(config)
		},
	)
	.command(
		'start',
		'Start all managed applications. Applications will auto-restart if they crash.',
		() => {
			/* Empty */
		},
		async () => {
			await runPhase('Registration', async () => register(config))
			await startAllApps(config)
		},
	)
	.command(
		'stop',
		'Stop all managed applications.',
		() => {
			/* Empty */
		},
		async () => {
			await register(config)
			await stopAllApps(config)
		},
	)
	.command(
		'update',
		'Update all managed applications and tasks to the latest available versions.',
		() => {
			/* Empty */
		},
		async () => {
			await register(config)
			await updateAllAppsAndTasks(config)
		},
	)
	.command(
		'upload-logs',
		'Upload all application and task logs to the configured S3 bucket.',
		() => {
			/* Empty */
		},
		async () => {
			await register(config)
			await uploadAllLogs(config)
		},
	)
	.command(
		'register',
		'Register itson with the system according to the config file. Optionally run this after changing state in the config file.',
		() => {
			/* Empty */
		},
		async () => {
			await register(config)
		},
	)
	.command(
		'config',
		'Open the itson config file in the default editor, creating a starter config file if none exists.',
		() => {
			/* Empty */
		},
		async () => {
			await editConfig(configFile)
		},
	)
	.command(
		'reset',
		'Clear any credentials stored in the system keychain, and remove any registered services.',
		() => {
			/* Empty */
		},
		async () => {
			await reset()
		},
	)
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.strict()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()
