import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { version } from '../../package.json'
import { clearCredentials } from '../lib/commands/clear-credentials'
import { updateAllApplications } from '../lib/commands/update'
import { loadConfig } from 'c12'
import { ItsonConfig } from '../lib/config'
import { startAllApplications } from '../lib/commands/start'
import { stopAllApplications } from '../lib/commands/stop'

const { config } = await loadConfig<ItsonConfig>({ name: 'itson' })

const yargsInstance = yargs(hideBin(process.argv))

// yes
await yargsInstance
	.scriptName('itson')
	.usage('$0 <command>', 'Run a itson command.')
	.option('verbose', {
		description: 'Run with verbose logging',
		type: 'boolean',
	})
	.command(
		'update',
		'Update all managed applications to the latest version, or install them if they are not present',
		() => {},
		async ({ verbose }) => {
			await updateAllApplications(config)
		},
	)
	.command(
		'start',
		'Start all managed applications to the latest version, or install them if they are not present',
		() => {},
		async ({ verbose }) => {
			await startAllApplications(config)
		},
	)
	.command(
		'stop',
		'Stop all managed applications',
		() => {},
		async ({ verbose }) => {
			await stopAllApplications(config)
		},
	)
	.command(
		'clear-credentials',
		'Clear any credentials stored in the system keychain',
		() => {},
		async ({ verbose }) => {
			await clearCredentials()
		},
	)
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()
