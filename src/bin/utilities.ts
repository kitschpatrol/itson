import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as s from '@clack/prompts'
import { execa } from 'execa'

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
		s.log.success(`Unzipped ${filePath} to ${extractTo}`)
		await unlink(filePath)
		return join(extractTo, topLevelItem)
	} catch (error) {
		s.log.error(`Error unzipping file: ${error}`)
		throw error
	}
}

export async function getVersion(filePath: string): Promise<string | undefined> {
	if (process.platform !== 'darwin') {
		throw new Error('getVersion is currently only supported on macOS.')
	}

	try {
		const plistPath = join(filePath, 'Contents', 'Info.plist')
		const { stdout } = await execa('defaults', ['read', plistPath, 'CFBundleShortVersionString'])
		return stdout.trim()
	} catch (error) {
		s.log.error(`Error getting version for ${filePath}: ${error}`)
		return undefined
	}
}
