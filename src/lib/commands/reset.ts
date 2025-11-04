import keytar from 'keytar-forked'
import { log } from 'lognow'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import { unregisterAll } from '../service'

async function clearCredentials() {
	log.info('Clearing credentials...')
	const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE)

	if (credentials.length === 0) {
		log.info('No credentials found')
		return
	}

	log.info(`Found ${credentials.length} credentials`)

	for (const credential of credentials) {
		log.info(`Deleting credential for ${credential.account}`)
		await keytar.deletePassword(KEYCHAIN_SERVICE, credential.account)
	}

	log.info('Credentials cleared')
}

/**
 * Clear any credentials stored in the system keychain, and remove any registered services
 */
export async function reset() {
	log.info('Resetting itson')
	await unregisterAll()
	await clearCredentials()
}
