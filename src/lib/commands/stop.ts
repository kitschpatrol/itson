import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { stopService } from '../service'

/**
 * Stop all applications
 */
export async function stopAllApps(config: ItsonConfig) {
	log.info('Stopping all applications')

	// Stop all applications (not tasks!)
	for (const app of config.applications) {
		await stopService(app)
	}
}
