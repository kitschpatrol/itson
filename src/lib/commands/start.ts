import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { startService } from '../service'

/**
 * Start all applications, default behavior
 */
export async function startAllApplications(config: ItsonConfig) {
	log.info('Starting all applications')

	// Start all applications (not tasks!)
	for (const application of config.applications) {
		await startService(application)
	}
}
