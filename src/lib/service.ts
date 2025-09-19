import { consola } from 'consola'
import { execa } from 'execa'
import { glob, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ItsonConfigApplication } from './config'
import { deleteFileSafe, readFileSafe } from './utilities'

function getServiceLabel(appName: string) {
	return `com.itson.${appName}`
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
 * On macOS, register a service with launchd which will keep an application running once launched.
 * @public
 */
export async function startService(
	application: ItsonConfigApplication,
	runOnStartup = false,
	runNow = false,
	keepAlive = true,
) {
	if (process.platform !== 'darwin') {
		throw new Error('Daemonization is currently only supported on macOS.')
	}

	consola.info(`Starting service for ${application.name}`)

	const label = getServiceLabel(application.name)
	const guiDomain = getGuiDomain()

	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

	// Use the invoking user's PATH to ensure the service can find node and such...
	const { stdout: userPath } = await execa('echo $PATH', { shell: true })

	const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
			<string>/usr/bin/env</string>
      <string>${application.command}</string>
      ${application.arguments?.map((arg) => `<string>${arg}</string>`).join('\n')}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${userPath}</string>
      <key>NODE_ENV</key>
      <string>production</string>
    </dict>		
    <key>RunAtLoad</key>
    ${runOnStartup ? '<true/>' : '<false/>'}
    <key>KeepAlive</key>
    ${
			keepAlive
				? `<dict>
      <key>SuccessfulExit</key>
      <true/>
      <key>Crashed</key>
      <true/>			
      <key>AfterInitialDemand</key>
      <true/>
    </dict>`
				: '<false/>'
		}		
    <key>SessionCreate</key>
    <false/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>StandardOutPath</key>
    <string>/tmp/${label}.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/${label}.err.log</string>
  </dict>
</plist>
`

	const { isLoaded, isRunning } = await getServiceState(label)

	if (isLoaded) {
		consola.info(`Service ${label} is already loaded.`)
	} else {
		consola.info(`Service ${label} is not loaded.`)
	}
	if (isRunning) {
		consola.info(`Service ${label} is running.`)
	}

	let isPlistChanged = false
	const existingPlistContent = await readFileSafe(plistPath)
	if (existingPlistContent === plistContent) {
		consola.info(`No changes to ${plistPath}`)
	} else {
		consola.info(`Plist for ${label} has changed`)
		isPlistChanged = true
	}

	try {
		if (isLoaded && isPlistChanged) {
			consola.info(`Booting out service ${label} to apply changes`)
			await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
		}

		if (isPlistChanged) {
			await writeFile(plistPath, plistContent, 'utf8')
			consola.info(`Wrote launchd service to ${plistPath}`)
		}

		if (!isLoaded || isPlistChanged) {
			consola.info('Bootstrapping service')
			await execa('launchctl', ['bootstrap', guiDomain, plistPath])
		}

		if (runNow) {
			if (isRunning) {
				consola.info(`Service ${label} is already running, not starting again.`)
			} else {
				consola.info(`Starting service ${label} now`)
				await execa('launchctl', ['kickstart', `${guiDomain}/${label}`])
			}
		}
	} catch (error) {
		consola.error(
			`Failed to register launchd service: ${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}
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
		consola.info(`Unloaded launchd service from ${plistFile}`)
		await deleteFileSafe(plistFile)
	}
}

/**
 * Unregister an application
 * @public
 */
export async function unregisterApp(application: ItsonConfigApplication) {
	const label = getServiceLabel(application.name)
	const guiDomain = getGuiDomain()
	const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
	await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
	await deleteFileSafe(plistPath)
}

/**
 * Start an application now, and keep it running. Does not run itself directly at startup, but will be by itson after updates if itson is registered to start on startup.
 */
export async function startApp(application: ItsonConfigApplication) {
	await startService(application, false, true, true)
}

/**
 * Stop an application
 */
export async function stopApp(application: ItsonConfigApplication) {
	const label = getServiceLabel(application.name)
	const guiDomain = getGuiDomain()
	await execa('launchctl', ['bootout', `${guiDomain}/${label}`], { reject: false })
}

const itsonApp: ItsonConfigApplication = {
	arguments: [],
	command: 'itson',
	name: 'Itson',
}

/**
 * Register itson to run on startup.
 */
export async function registerItson() {
	await startService(itsonApp, true, false, false)
}

/**
 * Unregister itson
 */
export async function unregisterItson() {
	await unregisterApp(itsonApp)
}

/**
 * Run itson now. (Testing only...)
 * @public
 */
export async function runItson() {
	await startService(itsonApp, true, true, false)
}
