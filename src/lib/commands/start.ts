import { consola } from 'consola'
import type { ItsonConfig, ItsonConfigApplication } from '../config'

/**
 * Start an application
 */
export function startApplication(application: ItsonConfigApplication) {
	consola.warn(`Start implementation pending for ${application.name}`)
}

/**
 * Start all applications
 */
export function startAllApplications(config: ItsonConfig) {
	for (const application of config.applications) {
		startApplication(application)
	}
}
