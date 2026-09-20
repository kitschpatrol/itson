import { text } from '@clack/prompts'
import { execa } from 'execa'
import isOnline from 'is-online'
import { log } from 'lognow'
import { subscribe } from 'node:diagnostics_channel'
import { cp, readFile, rename, rm, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'

/**
 * Prompt the user for a secret in the terminal.
 *
 * Refuses to prompt when stdin is not a TTY (e.g. when itson is launched by
 * launchd at startup), since the prompt would otherwise block forever.
 *
 * @param message The prompt shown to the user.
 * @param validate Returns an error message for invalid input, or undefined.
 *
 * @returns The entered value, or undefined if the prompt was cancelled or can't
 *   be shown.
 */
export async function promptForSecret(
	message: string,
	validate: (value: string) => string | undefined,
): Promise<string | undefined> {
	if (!process.stdin.isTTY) {
		log.error(
			`Can't prompt for input without a terminal: ${message} Run itson interactively once to store it in the keychain.`,
		)
		return undefined
	}

	const value = await text({
		message,
		validate(value: string | undefined) {
			return value === undefined || value.length === 0 ? 'A value is required.' : validate(value)
		},
	})

	if (typeof value !== 'string' || value.length === 0) {
		log.info('Operation cancelled.')
		return undefined
	}

	return value
}

/**
 * Replace every occurrence of a secret in a string, so command output and error
 * messages that echo a URL or argument containing it can be logged safely.
 *
 * @param value The text to redact.
 * @param secret The secret to remove.
 *
 * @returns The text with the secret replaced by `***`.
 */
export function redactSecret(value: string, secret: string): string {
	return secret.length === 0 ? value : value.replaceAll(secret, '***')
}

/**
 * Move a file or directory into place, replacing whatever is already there.
 *
 * The existing item is set aside as a sibling backup until the new one has
 * landed, and restored if the move fails, so a failed update never leaves the
 * destination empty. Falls back to a copy when the source is on a different
 * volume, where rename isn't possible.
 *
 * @param sourcePath The freshly downloaded file or directory.
 * @param destinationPath Where it should end up.
 * @throws {Error} If the new item couldn't be moved into place. The previous
 *   item is restored first.
 */
export async function replacePath(sourcePath: string, destinationPath: string): Promise<void> {
	const backupPath = `${destinationPath}.itson-backup`
	await rm(backupPath, { force: true, recursive: true })

	let hasBackup = false
	try {
		await rename(destinationPath, backupPath)
		hasBackup = true
	} catch (error) {
		if (!isFileNotFoundError(error)) {
			throw error
		}
	}

	try {
		await moveAcrossVolumes(sourcePath, destinationPath)
	} catch (error) {
		if (hasBackup) {
			await rm(destinationPath, { force: true, recursive: true })
			await rename(backupPath, destinationPath)
			log.warn(`Restored previous version at ${destinationPath} after a failed update`)
		}

		throw error
	}

	if (hasBackup) {
		await rm(backupPath, { force: true, recursive: true })
	}
}

async function moveAcrossVolumes(sourcePath: string, destinationPath: string): Promise<void> {
	try {
		await rename(sourcePath, destinationPath)
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error) || error.code !== 'EXDEV') {
			throw error
		}

		await cp(sourcePath, destinationPath, { recursive: true })
		await rm(sourcePath, { force: true, recursive: true })
	}
}

function isFileNotFoundError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Unzip a file on macOS.
 *
 * @param filePath The path to the file to unzip.
 *
 * @returns The path to the unzipped file.
 */
export async function unzip(filePath: string): Promise<string> {
	if (process.platform !== 'darwin') {
		throw new Error('Unzipping is currently only supported on macOS.')
	}

	const extractTo = dirname(filePath)

	try {
		const { stdout } = await execa('unzip', ['-l', filePath])
		const lines = stdout.split('\n')

		// The header is in lines[1], e.g. '  Length      Date    Time    Name'
		const nameHeaderIndex = lines[1]?.indexOf('Name') ?? -1
		if (nameHeaderIndex === -1) {
			throw new Error('Could not determine file list from unzip output.')
		}

		// The file list starts at lines[3]
		let topLevelItem = ''
		for (let i = 3; i < lines.length; i++) {
			const line = lines[i]
			// The list is terminated by a line of dashes
			if (line === undefined || line.trimStart().startsWith('---')) {
				break
			}

			// Get the file name, which is everything from the 'Name' column index onwards
			const name = line.slice(Math.max(0, nameHeaderIndex)).trim()
			if (name.length > 0) {
				// We only care about the top-level directory or file
				topLevelItem = name.split('/', 1)[0] ?? ''
				break // Found the first item, we can stop
			}
		}

		await execa('unzip', ['-o', filePath, '-d', extractTo])
		log.debug(`Unzipped ${filePath} to ${extractTo}`)
		await deleteFileSafe(filePath)

		if (topLevelItem.length === 0) {
			log.warn(`Could not determine top-level item in ${filePath}.`)
			return extractTo
		}

		const result = join(extractTo, topLevelItem)
		return result
	} catch (error) {
		log.error(`Error unzipping file: ${error instanceof Error ? error.message : String(error)}`)
		throw error
	}
}

/**
 * Get the version of a macOS application.
 *
 * @param filePath The path to the application.
 *
 * @returns The version of the application.
 */
export async function getVersion(filePath: string): Promise<string | undefined> {
	if (process.platform !== 'darwin') {
		throw new Error('getVersion is currently only supported on macOS.')
	}

	try {
		const plistPath = join(filePath, 'Contents', 'Info.plist')
		const { stdout } = await execa('defaults', ['read', plistPath, 'CFBundleShortVersionString'])
		return stdout.trim()
	} catch (error) {
		log.debug(
			`Error getting version for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		)
		return undefined
	}
}

/**
 * Read a file, but return undefined if the file does not exist.
 *
 * @param path The path to the file.
 *
 * @returns The file contents, or undefined if the file does not exist.
 */
export async function readFileSafe(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8')
	} catch (error) {
		if (error instanceof Error && error.message.includes('ENOENT')) {
			return undefined
		}

		throw error
	}
}

/**
 * Delete a file, but ignore errors if the file does not exist.
 *
 * @param path The path to the file.
 *
 * @returns True if the file was deleted, false if the file did not exist.
 */
export async function deleteFileSafe(path: string): Promise<boolean> {
	try {
		await unlink(path)
	} catch (error) {
		if (error instanceof Error && error.message.includes('ENOENT')) {
			return false
		}

		throw error
	}

	return true
}

/**
 * Upper bound on one round of connectivity probes. Kept short so every attempt
 * sees the network as it is now, rather than as it was when itson launched.
 */
const ONLINE_ATTEMPT_TIMEOUT_MS = 5000

/** Pause between failed attempts. */
const ONLINE_RETRY_DELAY_MS = 3000

/**
 * How long to keep trying before treating the machine as offline. At startup
 * itson can launch before DHCP has finished, so the network may only become
 * usable some seconds into this window.
 */
const ONLINE_WAIT_MS = 90_000

/**
 * Check whether the internet is reachable, waiting for it to come up if it
 * isn't yet. The result is memoized for the lifetime of the process, so
 * multiple phases of a single run share one check and an offline machine only
 * waits out the window once.
 *
 * @returns True if the internet is reachable, false otherwise.
 */
export async function checkOnline(): Promise<boolean> {
	onlineCheck ??= waitForOnline()
	return onlineCheck
}

let onlineCheck: Promise<boolean> | undefined

/**
 * Options for {@link waitForOnline}, exposed for testing.
 */
export type WaitForOnlineOptions = {
	/** Upper bound on a single probe round, in milliseconds. */
	attemptTimeout?: number
	/** The connectivity probe to run on each attempt. */
	probe?: (options: { timeout: number }) => Promise<boolean>
	/** Pause between failed attempts, in milliseconds. */
	retryDelay?: number
	/** Total time to keep trying, in milliseconds. */
	totalTimeout?: number
}

/**
 * Repeatedly probe for internet access until a probe succeeds or the total
 * timeout elapses.
 *
 * Each attempt is a fresh probe with a short timeout. A single long-running
 * probe can't do this, because its DNS lookups and connection attempts all
 * happen at the start, and a network that comes up part way through the wait is
 * never retried.
 *
 * @returns True if a probe succeeded within the window, false otherwise.
 */
export async function waitForOnline(options: WaitForOnlineOptions = {}): Promise<boolean> {
	const {
		attemptTimeout = ONLINE_ATTEMPT_TIMEOUT_MS,
		probe = isOnline,
		retryDelay = ONLINE_RETRY_DELAY_MS,
		totalTimeout = ONLINE_WAIT_MS,
	} = options

	logProbeFailures()

	const startTime = Date.now()

	for (let attempt = 1; ; attempt++) {
		if (await probe({ timeout: attemptTimeout })) {
			if (attempt > 1) {
				log.info(`Internet access detected after ${formatElapsedSeconds(startTime)}s`)
			}

			return true
		}

		if (Date.now() - startTime + retryDelay >= totalTimeout) {
			return false
		}

		log.debug(
			`No internet access yet after ${formatElapsedSeconds(startTime)}s (attempt ${attempt}), retrying`,
		)
		await sleep(retryDelay)
	}
}

function formatElapsedSeconds(startTime: number): string {
	return ((Date.now() - startTime) / 1000).toFixed(1)
}

const probeFailureSchema = z.object({
	error: z.object({
		code: z.string().optional(),
		message: z.string(),
		name: z.string(),
	}),
	url: z.string(),
})

let isLoggingProbeFailures = false

/**
 * Log the reason each individual connectivity probe fails. The is-online
 * package only reports these on a diagnostics channel, so without this the logs
 * show that a check failed but not why.
 */
function logProbeFailures(): void {
	if (isLoggingProbeFailures) {
		return
	}

	isLoggingProbeFailures = true

	subscribe('is-online:connectivity-check', (message) => {
		const parsed = probeFailureSchema.safeParse(message)
		if (!parsed.success) {
			return
		}

		const { error, url } = parsed.data
		log.debug(`Connectivity probe failed: ${url} (${error.code ?? error.name}: ${error.message})`)
	})
}
