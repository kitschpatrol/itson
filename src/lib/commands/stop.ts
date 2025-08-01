import { consola } from 'consola'
import type { ItsonConfig } from '../config'
import { stopApp } from '../service'

/**
 * Stop all applications
 */
export async function stopAllApplications(config: ItsonConfig) {
	consola.info('Stopping all applications')
	for (const application of config.applications) {
		await stopApp(application)
	}
}
