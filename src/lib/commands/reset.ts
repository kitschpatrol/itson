import keytar from 'keytar-forked'
import { log } from 'lognow'
import plur from 'plur'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import { unregisterAll } from '../service'

async function clearCredentials() {
	log.info('Clearing credentials...')
	const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE)

	if (credentials.length === 0) {
		log.debug('No credentials found')
		return
	}

	log.debug(`Found ${credentials.length} credentials`)

	for (const credential of credentials) {
		log.debug(`Deleting credential for ${credential.account}`)
		await keytar.deletePassword(KEYCHAIN_SERVICE, credential.account)
	}

	log.info(`Cleared ${credentials.length} ${plur('credential', credentials.length)}`)
}

/**
 * Clear any credentials stored in the system keychain, and remove any registered services
 */
export async function reset() {
	log.info('Resetting itson')
	await unregisterAll()
	await clearCredentials()
}
