import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { consola } from 'consola'
import { version } from '../../package.json'
import { updateAllApplications } from '../lib/commands/update'
import { loadConfig } from 'c12'
import { ItsupConfig } from '../lib/config'
import { startAllApplications } from '../lib/commands/start'
import os from 'os'
import { stopAllApplications } from '../lib/commands/stop'
import { register } from '../lib/commands/register'
import { reset } from '../lib/commands/reset'

// Config
const { config, configFile, source, cwd } = await loadConfig<ItsupConfig>({
	name: 'itsup',
	cwd: os.homedir(), // rcfile search in home dir doesn't seem to work...
	globalRc: true,
})

const yargsInstance = yargs(hideBin(process.argv))

// yes
await yargsInstance
	.scriptName('itsup')
	.usage('$0 [command]', 'Run an itsup command.')
	.option('verbose', {
		description: 'Run with verbose logging',
		type: 'boolean',
	})
	.command(
		['$0', 'launch'],
		'Update, register, and start all managed applications. Applications will auto-restart if they crash.',
		() => {},
		async ({ verbose }) => {
			consola.info(`Itsup config file found at "${configFile}"`)
			consola.info('Launching itsup')

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
		'Register itsup with the system according to the config file. Optionally run this after changing state in the config file.',
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
