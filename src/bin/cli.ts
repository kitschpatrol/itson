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

const { config, configFile, source, cwd } = await loadConfig<ItsonConfig>({
	name: 'itson',
	cwd: os.homedir(), // rcfile search in home dir doesn't seem to work...
	globalRc: true,
})

const yargsInstance = yargs(hideBin(process.argv))

consola.info(`Itson config file found at "${configFile}"`)

// yes
await yargsInstance
	.scriptName('itson')
	.usage('$0 [command]', 'Run an itson command. Defaults to `launch` if a command is not provided.')
	.option('verbose', {
		description: 'Run with verbose logging',
		type: 'boolean',
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async ({ verbose }) => {
			consola.info('Launching itson')
			// Register itson if appropriate
			await register(config)
			await updateAllApplications(config)
			await startAllApplications(config)
		},
	)
	.command(
		'start',
		'Start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async ({ verbose }) => {
			await startAllApplications(config)
		},
	)
	.command(
		'stop',
		'Stop all managed applications.',
		() => {},
		async ({ verbose }) => {
			await stopAllApplications(config)
		},
	)
	.command(
		'update',
		'Update all managed applications to the latest available versions.',
		() => {},
		async ({ verbose }) => {
			await updateAllApplications(config)
		},
	)
	.command(
		'register',
		'Register itson with the system according to the config file. Optionally run this after changing state in the config file.',
		() => {},
		async ({ verbose }) => {
			register(config)
		},
	)
	.command(
		'reset',
		'Clear any credentials stored in the system keychain, and remove any registered services.',
		() => {},
		async ({ verbose }) => {
			await reset()
		},
	)
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()
