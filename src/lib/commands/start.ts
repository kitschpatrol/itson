import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { startApp } from '../service'

/**
 * Start all applications, default behavior
 */
export async function startAllApplications(config: ItsonConfig) {
	log.info('Starting all applications')

	// Start all applications
	for (const application of config.applications) {
		await startApp(application)
	}
}
