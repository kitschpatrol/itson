import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { stopService } from '../service'

/**
 * Stop all applications
 */
export async function stopAllApplications(config: ItsonConfig) {
	log.info('Stopping all applications')

	// Stop all applications (not tasks!)
	for (const application of config.applications) {
		await stopService(application)
	}
}
