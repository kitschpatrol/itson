// @case-police-ignore MacOS

import { execa } from 'execa'
import { log } from 'lognow'
import { glob, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dumpConfigTypes } from '../config-types'

const STARTER_CONFIG_FILE_NAME = 'itson.config.ts'

/**
 * Contents of the config file written when the user doesn't have one yet.
 *
 * The commented-out examples are indented one level deeper than the keys they
 * belong to, which lets test/config-command.test.ts uncomment and validate
 * them.
 */
export const STARTER_CONFIG = String.raw`// Itson configuration. Run "itson" to apply changes.
// Reference: https://github.com/kitschpatrol/itson#configuration

export default {
	// Applications start when itson runs, and restart if they exit or crash.
	applications: [
		// {
		// 	name: 'AllWork',
		// 	command: '/Applications/AllWork.app/Contents/MacOS/AllWork',
		// 	arguments: ['--config=~/AllWork/settings.json'],
		// 	update: {
		// 		type: 'github',
		// 		owner: 'kitschpatrol',
		// 		repo: 'allwork',
		// 		artifactPattern: /^AllWork.+\.zip$/,
		// 		destination: '/Applications/AllWork.app',
		// 	},
		// 	logUpload: {
		// 		type: 's3',
		// 		bucketName: 'exhibit-logs',
		// 		endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
		// 		localPath: '~/Library/Logs/AllWork',
		// 	},
		// },
	],
	// Tasks run once at each scheduled time. Cron syntax, in local time.
	tasks: [
		// {
		// 	name: 'Say',
		// 	command: 'say',
		// 	arguments: ['Itson is on task!'],
		// 	schedule: '0 9 * * *',
		// },
	],
	// Register itson to run at system startup.
	runOnStartup: false,
} satisfies import('./.itson/itson.js').ItsonConfig
`

/**
 * Open the itson configuration file in the default editor, creating a starter
 * config file in the home directory if there isn't one already.
 *
 * @param configFile Path to the config file that was loaded, or undefined if
 *   none was found.
 * @public
 */
export async function editConfig(configFile: string | undefined): Promise<void> {
	if (process.platform !== 'darwin') {
		throw new Error('Opening the config file is currently only supported on macOS.')
	}

	// The config file is about to be edited against these, so make sure they're
	// present and current, without letting a failure block the edit
	try {
		await dumpConfigTypes()
	} catch (error) {
		log.warn(
			`Could not write config types: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	const filePath = configFile ?? (await findConfigFile()) ?? (await createStarterConfig())

	log.info(`Opening "${filePath}"`)
	await openInDefaultEditor(filePath)
}

/**
 * Look for a config file in the home directory. Only needed when the config
 * loader couldn't report one, which happens when the file fails to parse.
 */
async function findConfigFile(): Promise<string | undefined> {
	const matches = await Array.fromAsync(glob('itson.config.*', { cwd: os.homedir() }))
	const [match] = matches.toSorted()
	return match === undefined ? undefined : path.join(os.homedir(), match)
}

/**
 * Write a commented starter config to the home directory, where the config
 * loader looks for it.
 *
 * @returns The path to the new config file.
 * @throws {Error} If a file is already there. Overwriting would discard
 *   whatever the user had.
 */
async function createStarterConfig(): Promise<string> {
	const filePath = path.join(os.homedir(), STARTER_CONFIG_FILE_NAME)
	await writeFile(filePath, STARTER_CONFIG, { encoding: 'utf8', flag: 'wx' })
	log.info(`Created a starter config file at "${filePath}"`)
	return filePath
}

/**
 * Open a file with the macOS default application for its type, falling back to
 * the default text editor when nothing is associated with the extension.
 */
async function openInDefaultEditor(filePath: string): Promise<void> {
	try {
		await execa('open', [filePath])
	} catch (error) {
		log.withError(error).debug('No default application for the config file, opening it as text')
		await execa('open', ['-t', filePath])
	}
}
