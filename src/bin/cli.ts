#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { log, setDefaultLogOptions, getJsonFileTransportDestinations } from 'lognow'
import { version, name } from '../../package.json'
import { updateAllAppsAndTasks } from '../lib/commands/update'
import { loadConfig } from 'c12'
import { ItsonConfig, DEFAULT_ITSON_CONFIG } from '../lib/config'
import { startAllApplications } from '../lib/commands/start'
import os from 'os'
import { stopAllApplications } from '../lib/commands/stop'
import { register } from '../lib/commands/register'
import { reset } from '../lib/commands/reset'
import { uploadAllLogs } from '../lib/commands/log-upload'

setDefaultLogOptions({ name, logJsonToFile: true })

// Config
const { config, configFile } = await loadConfig<ItsonConfig>({
	name: 'itson',
	cwd: os.homedir(), // rcfile search in home dir doesn't seem to work...
	globalRc: true,
	defaultConfig: DEFAULT_ITSON_CONFIG,
})

const yargsInstance = yargs(hideBin(process.argv))

// yes
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

		// Set console level globally based on verbose flag
		setDefaultLogOptions({ verbose: argv.verbose })

		log.debug('Verbose logging enabled')
		log.debug(`Logging to file: "${getJsonFileTransportDestinations().at(0)}"`)
		log.withMetadata({ config }).debug('Loaded config:')
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async () => {
			log.info(`Itson config file found at "${configFile}"`)
			log.info('Launching itson')

			await register(config)
			await updateAllAppsAndTasks(config)
			await uploadAllLogs(config)
			await startAllApplications(config)
		},
	)
	.command(
		'start',
		'Start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async () => {
			await startAllApplications(config)
		},
	)
	.command(
		'stop',
		'Stop all managed applications.',
		() => {},
		async () => {
			await stopAllApplications(config)
		},
	)
	.command(
		'update',
		'Update all managed applications to the latest available versions.',
		() => {},
		async () => {
			await updateAllAppsAndTasks(config)
		},
	)
	.command(
		'upload-logs',
		'Upload all application logs to the configured S3 bucket.',
		() => {},
		async () => {
			await uploadAllLogs(config)
		},
	)
	.command(
		'register',
		'Register itson with the system according to the config file. Optionally run this after changing state in the config file.',
		() => {},
		async () => {
			register(config)
		},
	)
	.command(
		'reset',
		'Clear any credentials stored in the system keychain, and remove any registered services.',
		() => {},
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
