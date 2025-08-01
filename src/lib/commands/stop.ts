import { consola } from 'consola'
import type { ItsonConfig, ItsonConfigApplication } from '../config'

/**
 * Stop an application
 */
export function stopApplication(application: ItsonConfigApplication) {
	consola.warn(`Stop implementation pending for ${application.name}`)
}

/**
 * Stop all applications
 */
export function stopAllApplications(config: ItsonConfig) {
	for (const application of config.applications) {
		stopApplication(application)
	}
}
