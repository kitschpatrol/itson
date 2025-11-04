import { execa } from 'execa'
import { log } from 'lognow'
import { readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Unzip a file on macOS.
 * @param filePath The path to the file to unzip.
 * @returns The path to the unzipped file.
 */
export async function unzip(filePath: string): Promise<string> {
	const extractTo = dirname(filePath)

	if (process.platform !== 'darwin') {
		throw new Error('Unzipping is currently only supported on macOS.')
	}

	try {
		const { stdout } = await execa('unzip', ['-l', filePath])
		const lines = stdout.split('\n')

		// The header is in lines[1], e.g. '  Length      Date    Time    Name'
		const nameHeaderIndex = lines[1].indexOf('Name')
		if (nameHeaderIndex === -1) {
			throw new Error('Could not determine file list from unzip output.')
		}

		// The file list starts at lines[3]
		let topLevelItem = ''
		for (let i = 3; i < lines.length; i++) {
			const line = lines[i]
			// The list is terminated by a line of dashes
			if (line.trim().startsWith('---')) {
				break
			}
			// Get the file name, which is everything from the 'Name' column index onwards
			const name = line.slice(Math.max(0, nameHeaderIndex)).trim()
			if (name) {
				// We only care about the top-level directory or file
				topLevelItem = name.split('/')[0]
				break // Found the first item, we can stop
			}
		}

		await execa('unzip', ['-o', filePath, '-d', extractTo])
		log.debug(`Unzipped ${filePath} to ${extractTo}`)
		await deleteFileSafe(filePath)

		if (!topLevelItem) {
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
 * @param filePath The path to the application.
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
 * @param path The path to the file.
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
 * @param path The path to the file.
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
 * Check if the internet is reachable and DNS is working.
 * @returns True if the internet is reachable, false otherwise.
 * @public
 */
export async function checkInternetConnectivity() {
	const { stderr, stdout } = await execa('ping', ['-c', '1', 'google.com'])
	if (stdout.includes('1 packets received')) {
		return true
	}
	log.error(
		'No internet connectivity detected. Please check your network connection and try again.',
	)
	log.error(stdout)
	log.error(stderr)
	return false
}
