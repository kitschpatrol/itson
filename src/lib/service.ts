import { execa } from 'execa'
import { log } from 'lognow'
import { glob, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ItsonConfig, ItsonConfigApp, ItsonConfigTask } from './config'
import { isApp, isTask } from './config'
import { ITSON_TASK_NAME } from './constants'
import { deleteFileSafe, readFileSafe } from './utilities'
import { createAppPlist } from './utilities/plist-builder'

function getServiceLabel(item: ItsonConfigApp | ItsonConfigTask): string {
	return `com.itson.${isTask(item) ? 'task' : 'app'}.${item.name}`
}

function getGuiDomain() {
	return `gui/${os.userInfo().uid}`
}

async function getServiceState(label: string): Promise<{ isLoaded: boolean; isRunning: boolean }> {
	const guiDomain = getGuiDomain()
	try {
		const { stdout } = await execa('launchctl', ['print', `${guiDomain}/${label}`])
		const isRunning = stdout.includes('pid = ')
		return { isLoaded: true, isRunning }
	} catch {
		return { isLoaded: false, isRunning: false }
	}
}

/**
 * What {@link startService} had to do to bring a service to its desired state.
 *
 * - `registered`: the service was not loaded, so its plist was written and
 *   bootstrapped. Applications are also started.
 * - `updated`: the plist changed, so the service was reloaded. Applications are
 *   also restarted.
 * - `started`: the application was already registered but not running, so it was
 *   started. Never returned for tasks.
 * - `unchanged`: nothing needed to be done.
 */
export type ServiceOutcome = 'registered' | 'started' | 'unchanged' | 'updated'

/**
 * On macOS, register a service with launchd. Applications start immediately and
 * will keep running. Tasks start on schedule and will run once and then stop.
 * They will not run immediately.
 *
 * Idempotent: the plist is only rewritten and the service only reloaded when
 * the generated plist differs from the one on disk or the service isn't
 * loaded.
 *
 * @returns What was done to bring the service to its desired state.
 * @public
 */
export async function startService(
	appOrTask: ItsonConfigApp | ItsonConfigTask,
): Promise<ServiceOutcome> {
	if (process.platform !== 'darwin') {
		throw new Error('Daemonization is currently only supported on macOS.')
	}

	log.debug(`Syncing service for ${appOrTask.name}`)

	const label = getServiceLabel(appOrTask)
	const guiDomain = getGuiDomain()

	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

	// Use the invoking user's PATH to ensure the service can find node and such...
	const { stdout: userPath } = await execa('echo $PATH', { shell: true })

	const plistContent = createAppPlist({
		arguments: appOrTask.arguments,
		command: appOrTask.command,
		keepAlive: isApp(appOrTask),
		label,
		schedule: appOrTask.schedule,
		userPath,
	})

	const { isLoaded, isRunning } = await getServiceState(label)

	if (isLoaded) {
		log.debug(`Service ${label} is already loaded.`)
	} else {
		log.debug(`Service ${label} is not loaded.`)
	}

	if (isRunning) {
		log.debug(`Service ${label} is running.`)
	}

	let isPlistChanged = false
	const existingPlistContent = await readFileSafe(plistPath)
	if (existingPlistContent === plistContent) {
		log.debug(`No changes to ${plistPath}`)
	} else {
		log.debug(`Plist for ${label} has changed`)
		isPlistChanged = true
	}

	let outcome: ServiceOutcome = 'unchanged'

	try {
		if (isLoaded && isPlistChanged) {
			log.debug(`Booting out service ${label} to apply changes`)
			await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
		}

		if (isPlistChanged) {
			await writeFile(plistPath, plistContent, 'utf8')
			log.debug(`Wrote launchd service to ${plistPath}`)
		}

		if (!isLoaded || isPlistChanged) {
			log.debug('Bootstrapping service')
			await execa('launchctl', ['bootstrap', guiDomain, plistPath])
			outcome = isLoaded ? 'updated' : 'registered'
		}

		// Applications start immediately and will keep running.
		// Tasks don't!
		if (isApp(appOrTask)) {
			// A booted-out application is no longer running, whatever the state
			// check said before the plist was reloaded
			if (isRunning && !isPlistChanged) {
				log.debug(`Service ${label} is already running, not starting again.`)
			} else {
				log.debug(`Starting service ${label} now`)
				await execa('launchctl', ['kickstart', `${guiDomain}/${label}`])

				if (outcome === 'unchanged') {
					outcome = 'started'
				}
			}
		}
	} catch (error) {
		log.error(
			`Failed to register launchd service: ${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}

	return outcome
}

/**
 * Unregister any "orphaned" launchd services that are not in the config.
 *
 * @public
 */
export async function unregisterOrphans(config: ItsonConfig): Promise<number> {
	const plistPaths = await getAllPlistPaths()

	const activePlistNames = new Set([
		getServiceLabel(itsonTask),
		...config.applications.map((app) => getServiceLabel(app)),
		...config.tasks.map((task) => getServiceLabel(task)),
	])

	const guiDomain = getGuiDomain()

	let deletedCount = 0
	for (const plistPath of plistPaths) {
		const plistName = path.basename(plistPath, '.plist')
		if (activePlistNames.has(plistName)) {
			continue
		}

		await execa('launchctl', ['bootout', `${guiDomain}/${plistName}`], { reject: false })
		await deleteFileSafe(plistPath)
		log.debug(`Unloaded orphaned launchd service from ${plistPath}`)
		deletedCount++
	}

	return deletedCount
}

async function getAllPlistPaths(): Promise<string[]> {
	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.itson.*.plist')

	const plistPaths: string[] = await Array.fromAsync(glob(plistPath))

	return plistPaths
}

/**
 * Stop and unregister all services with the label `com.itson.*`.
 *
 * @public
 */
export async function unregisterAll() {
	if (process.platform !== 'darwin') {
		throw new Error('Daemonization is currently only supported on macOS.')
	}

	const plistPaths = await getAllPlistPaths()
	const guiDomain = getGuiDomain()

	for (const plistFile of plistPaths) {
		const label = path.basename(plistFile, '.plist')
		await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
		log.debug(`Unloaded launchd service from ${plistFile}`)
		await deleteFileSafe(plistFile)
	}
}

/**
 * Unregister an application stops the service and removes the plist file
 *
 * @returns True if the service was registered and has now been removed, false
 *   if there was nothing to remove.
 * @public
 */
export async function unregisterService(
	appOrTask: ItsonConfigApp | ItsonConfigTask,
): Promise<boolean> {
	await stopService(appOrTask)
	const label = getServiceLabel(appOrTask)
	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
	return deleteFileSafe(plistPath)
}

/**
 * Stop an application
 */
export async function stopService(app: ItsonConfigApp | ItsonConfigTask) {
	const label = getServiceLabel(app)
	const guiDomain = getGuiDomain()
	await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
}

const itsonTask: ItsonConfigTask = {
	name: ITSON_TASK_NAME,
	command: 'itson',
	arguments: [],
	schedule: '@reboot',
}

/**
 * Register itson to run on startup.
 *
 * @returns What was done to bring the registration to its desired state.
 */
export async function registerItson(): Promise<ServiceOutcome> {
	return startService(itsonTask)
}

/**
 * Unregister itson from running on startup.
 *
 * @returns True if itson was registered and has now been removed.
 */
export async function unregisterItson(): Promise<boolean> {
	return unregisterService(itsonTask)
}
