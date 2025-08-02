import { consola } from 'consola'
import type { ItsupConfig } from '../config'
import { registerItsup, unregisterItsup } from '../service'

/**
 * Sync any config state to the system
 */
export async function register(config: ItsupConfig) {
	// Register itsup if appropriate
	if (config.runOnStartup) {
		consola.info('Registering itsup to run on startup')
		await registerItsup()
	} else {
		consola.info('Unregistering itsup from running on startup')
		await unregisterItsup()
	}
}
