import { consola } from 'consola'
import type { ItsonConfig } from '../config'
import { registerItson, startApp, unregisterItson } from '../service'
import { updateAllApplications } from './update'

/**
 * Start all applications, default behavior
 */
export async function startAllApplications(config: ItsonConfig) {
	consola.info('Starting all applications')

	// Register itson if appropriate
	if (config.runOnStartup) {
		consola.info('Registering itson')
		await registerItson()
	} else {
		consola.info('Unregistering itson')
		await unregisterItson()
	}

	// Update all applications
	await updateAllApplications(config)

	// Start all applications
	for (const application of config.applications) {
		await startApp(application)
	}
}
