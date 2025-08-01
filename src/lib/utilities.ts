import { consola } from 'consola'
import { execa } from 'execa'
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
		const topLevelItem = lines[3].split(/\s+/)[4]

		await execa('unzip', ['-o', filePath, '-d', extractTo])
		consola.success(`Unzipped ${filePath} to ${extractTo}`)
		await deleteFileSafe(filePath)
		return join(extractTo, topLevelItem)
	} catch (error) {
		consola.error(`Error unzipping file: ${error instanceof Error ? error.message : String(error)}`)
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
		consola.error(
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
