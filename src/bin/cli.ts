import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { consola } from 'consola'
import { version } from '../../package.json'
import { updateAllApplications } from '../lib/commands/update'
import { loadConfig } from 'c12'
import { ItsonConfig } from '../lib/config'
import { startAllApplications } from '../lib/commands/start'
import os from 'os'
import { stopAllApplications } from '../lib/commands/stop'
import { register } from '../lib/commands/register'
import { reset } from '../lib/commands/reset'
import { uploadAllApplicationLogs } from '../lib/commands/log-upload'

// Config
const { config, configFile, source, cwd } = await loadConfig<ItsonConfig>({
	name: 'itson',
	cwd: os.homedir(), // rcfile search in home dir doesn't seem to work...
	globalRc: true,
})

const yargsInstance = yargs(hideBin(process.argv))

// yes
await yargsInstance
	.scriptName('itson')
	.usage('$0 [command]', 'Run an itson command.')
	.option('verbose', {
		description: 'Run with verbose logging',
		type: 'boolean',
	})
	.middleware((argv) => {
		// Set console level globally based on verbose flag
		if (argv.verbose) {
			consola.level = 5 // Shows debug messages
		}
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async () => {
			consola.info(`Itson config file found at "${configFile}"`)
			consola.info('Launching itson')

			await register(config)
			await updateAllApplications(config)
			await uploadAllApplicationLogs(config)
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
			await updateAllApplications(config)
		},
	)
	.command(
		'upload-logs',
		'Upload all application logs to the configured S3 bucket.',
		() => {},
		async () => {
			await uploadAllApplicationLogs(config)
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
