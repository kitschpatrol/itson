import { consola } from 'consola'
import path from 'node:path'
import type { ItsonConfigApplication } from '../config'

/**
 * On macOS, register a service with launchd which will keep an application running once launched.
 * @public
 */
export function registerService(application: ItsonConfigApplication) {
	if (process.platform !== 'darwin') {
		throw new Error('Daemonization is currently only supported on macOS.')
	}

	// Special case if the application ends with .app
	const baseName = path.basename(application.destination, path.extname(application.destination))
	consola.info(baseName)
	const executionPath = application.destination.endsWith('.app')
		? application.destination
		: path.join(application.destination, 'Contents', 'MacOS', baseName)

	consola.info(executionPath)

	// Create and install the launchd plist or whatever is necessary, the application should restart itself automatically if it crashes

	// This function should be idempotent
}
