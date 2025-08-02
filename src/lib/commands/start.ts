import { consola } from 'consola'
import type { ItsupConfig } from '../config'
import { startApp } from '../service'

/**
 * Start all applications, default behavior
 */
export async function startAllApplications(config: ItsupConfig) {
	consola.info('Starting all applications')

	// Start all applications
	for (const application of config.applications) {
		await startApp(application)
	}
}
