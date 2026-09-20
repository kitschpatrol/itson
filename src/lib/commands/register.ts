import { log } from 'lognow'
import plur from 'plur'
import type { ItsonConfig } from '../config'
import type { ServiceOutcome } from '../service'
import { dumpConfigTypes } from '../config-types'
import { registerItson, startService, unregisterItson, unregisterOrphans } from '../service'
import { getCronStringDescription } from '../utilities/cron-to-launchd'

/**
 * Sync any config state to the system
 */
export async function register(config: ItsonConfig) {
	// Keep the editor-facing config type definitions in ~/.itson fresh, without
	// letting a failure interrupt the launch
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
		logRegistrationOutcome('itson', 'on startup', await registerItson())
	} else if (await unregisterItson()) {
		log.info('Unregistered itson from running on startup')
	} else {
		log.debug('itson is not registered to run on startup')
	}

	// Clean up tasks missing from the config
	const orphanCount = await unregisterOrphans(config)
	if (orphanCount > 0) {
		log.info(`Removed ${orphanCount} orphaned ${plur('service', orphanCount)}`)
	}

	// Register tasks with the OS
	for (const task of config.tasks) {
		const schedule = lowercaseFirstLetter(getCronStringDescription(task.schedule))
		logRegistrationOutcome(`task ${task.name}`, schedule, await startService(task))
	}

	// Applications are registered right before being started by itson in `start`
}

/**
 * Report a registration at info level only when something changed, so a routine
 * launch doesn't read as if everything was re-registered.
 */
function logRegistrationOutcome(name: string, schedule: string, outcome: ServiceOutcome): void {
	if (outcome === 'registered') {
		log.info(`Registered ${name} to run ${schedule}`)
	} else if (outcome === 'updated') {
		log.info(`Updated ${name} to run ${schedule}`)
	} else {
		log.debug(`${name} is already registered to run ${schedule}`)
	}
}

/** Cron descriptions come back sentence-cased, e.g. "At 01:50 AM". */
function lowercaseFirstLetter(value: string): string {
	return value.charAt(0).toLowerCase() + value.slice(1)
}
