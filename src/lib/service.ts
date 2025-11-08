import { execa } from 'execa'
import { log } from 'lognow'
import { glob, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ItsonConfig, ItsonConfigApplication, ItsonConfigTask } from './config'
import { isApplication, isTask } from './config'
import { deleteFileSafe, readFileSafe } from './utilities'
import { createApplicationPlist } from './utilities/plist-builder'

function getServiceLabel(item: ItsonConfigApplication | ItsonConfigTask): string {
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
 * On macOS, register a service with launchd.
 * Applications start immediately and will keep running.
 * Tasks start on schedule and will run once and then stop. They will not run immediately.
 * @public
 */
export async function startService(appOrTask: ItsonConfigApplication | ItsonConfigTask) {
	if (process.platform !== 'darwin') {
		throw new Error('Daemonization is currently only supported on macOS.')
	}

	log.info(`Starting service for ${appOrTask.name}`)

	const label = getServiceLabel(appOrTask)
	const guiDomain = getGuiDomain()

	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

	// Use the invoking user's PATH to ensure the service can find node and such...
	const { stdout: userPath } = await execa('echo $PATH', { shell: true })

	const plistContent = createApplicationPlist({
		arguments: appOrTask.arguments,
		command: appOrTask.command,
		keepAlive: isApplication(appOrTask),
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
		}

		// Applications start immediately and will keep running.
		// Tasks don't!
		if (isApplication(appOrTask)) {
			if (isRunning) {
				log.debug(`Service ${label} is already running, not starting again.`)
			} else {
				log.debug(`Starting service ${label} now`)
				await execa('launchctl', ['kickstart', `${guiDomain}/${label}`])
			}
		}
	} catch (error) {
		log.error(
			`Failed to register launchd service: ${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}
}

/**
 * Unregister any "orphaned" launchd services that are not in the config.
 * @public
 */
export async function unregisterOrphans(config: ItsonConfig): Promise<number> {
	const plistPaths = await getAllPlistPaths()

	const activePlistNames = new Set([
		getServiceLabel(itsonTask),
		...config.applications.map((application) => getServiceLabel(application)),
		...config.tasks.map((task) => getServiceLabel(task)),
	])

	const guiDomain = getGuiDomain()

	let deleteCount = 0
	for (const plistPath of plistPaths) {
		const plistName = path.basename(plistPath, '.plist')
		if (!activePlistNames.has(plistName)) {
			await execa('launchctl', ['bootout', `${guiDomain}/${plistName}`], { reject: false })
			await deleteFileSafe(plistPath)
			log.debug(`Unloaded orphaned launchd service from ${plistPath}`)
			deleteCount++
		}
	}

	return deleteCount
}

async function getAllPlistPaths(): Promise<string[]> {
	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.itson.*.plist')
	const plistFiles = glob(plistPath)

	const plistPaths: string[] = []
	for await (const plistFile of plistFiles) {
		plistPaths.push(plistFile)
	}
	return plistPaths
}

/**
 * Stop and unregister all services with the label `com.itson.*`.
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
 * @public
 */
export async function unregisterService(appOrTask: ItsonConfigApplication | ItsonConfigTask) {
	await stopService(appOrTask)
	const label = getServiceLabel(appOrTask)
	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
	await deleteFileSafe(plistPath)
}

/**
 * Stop an application
 */
export async function stopService(application: ItsonConfigApplication | ItsonConfigTask) {
	const label = getServiceLabel(application)
	const guiDomain = getGuiDomain()
	await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
}

const itsonTask: ItsonConfigTask = {
	arguments: [],
	command: 'itson',
	name: 'Itson',
	schedule: '@reboot',
}

/**
 * Register itson to run on startup.
 */
export async function registerItson() {
	await startService(itsonTask)
}

/**
 * Unregister itson
 */
export async function unregisterItson() {
	await unregisterService(itsonTask)
}
