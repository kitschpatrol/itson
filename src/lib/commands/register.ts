import { log } from 'lognow'
import type { ItsonConfig } from '../config'
import { dumpConfigTypes } from '../config-types'
import { registerItson, startService, unregisterItson, unregisterOrphans } from '../service'
import { getCronStringDescription } from '../utilities/cron-to-launchd'

/**
 * Sync any config state to the system
 */
export async function register(config: ItsonConfig) {
	// Keep the editor-facing config type definitions in ~/.itson fresh, without
	// letting a failure interrupt an exhibit launch
	try {
		await dumpConfigTypes()
	} catch (error) {
		log.warn(
			`Could not write config types: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	// Itson is a special case task!
	// Register itson if appropriate
	if (config.runOnStartup) {
		log.info('Registering itson to run on startup')
		await registerItson()
	} else {
		log.info('Unregistering itson from running on startup')
		await unregisterItson()
	}

	// Clean up tasks missing from the config
	await unregisterOrphans(config)

	// Register tasks with the OS
	for (const task of config.tasks) {
		log.info(`Registering task ${task.name} to run at ${getCronStringDescription(task.schedule)}`)
		await startService(task)
	}

	// Applications are registered right before being started by itson in `start`
}
