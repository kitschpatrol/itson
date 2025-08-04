import { consola } from 'consola'
import type { ItsonConfig } from '../config'
import { registerItson, unregisterItson } from '../service'

/**
 * Sync any config state to the system
 */
export async function register(config: ItsonConfig) {
	// Register itson if appropriate
	if (config.runOnStartup) {
		consola.info('Registering itson to run on startup')
		await registerItson()
	} else {
		consola.info('Unregistering itson from running on startup')
		await unregisterItson()
	}
}
