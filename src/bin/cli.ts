#!/usr/bin/env node

import { loadConfig } from 'c12'
import { getJsonFileTransportDestinations, log, setDefaultLogOptions } from 'lognow'
import os from 'node:os'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { z } from 'zod'
import type { ItsonConfigInput } from '../lib/config'
import { name, version } from '../../package.json'
import { uploadAllLogs } from '../lib/commands/log-upload'
import { register } from '../lib/commands/register'
import { reset } from '../lib/commands/reset'
import { startAllApps } from '../lib/commands/start'
import { stopAllApps } from '../lib/commands/stop'
import { updateAllAppsAndTasks } from '../lib/commands/update'
import { DEFAULT_ITSON_CONFIG, itsonConfigSchema } from '../lib/config'

setDefaultLogOptions({ logJsonToFile: true, name })

// Config
const { config: rawConfig, configFile } = await loadConfig<ItsonConfigInput>({
	cwd: os.homedir(), // Rcfile search in home dir doesn't seem to work...
	defaultConfig: DEFAULT_ITSON_CONFIG,
	globalRc: true,
	name: 'itson',
})

const parsedConfig = itsonConfigSchema.safeParse(rawConfig)
if (!parsedConfig.success) {
	log.error(`Invalid itson configuration${configFile === undefined ? '' : ` at "${configFile}"`}:`)
	log.error(z.prettifyError(parsedConfig.error))
	process.exit(1)
}

const config = parsedConfig.data

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
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {
			/* Empty */
		},
		async () => {
			log.info(`Itson config file found at "${configFile}"`)
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
