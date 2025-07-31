import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { version } from '../../package.json'

const yargsInstance = yargs(hideBin(process.argv))

await yargsInstance
	.scriptName('itson')
	.usage('$0 <command>', 'Run a itson command.')
	.option('verbose', {
		description: 'Run with verbose logging',
		type: 'boolean',
	})
	.command(
		'sync',
		'do some stuff',
		() => {},
		({ verbose }) => {
			if (verbose) {
				process.stderr.write('Do some stuff here\n')
			}
		},
	)
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()
