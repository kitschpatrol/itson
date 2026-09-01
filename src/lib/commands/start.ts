import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { startService } from '../service'

/**
 * Start all applications, default behavior
 */
export async function startAllApps(config: ItsonConfig) {
	log.info('Starting all applications')

	// Start all applications (not tasks!)
	for (const app of config.applications) {
		await startService(app)
	}
}
