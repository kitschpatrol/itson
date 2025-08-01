import { consola } from 'consola/basic'
import keytar from 'keytar-forked'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'

/**
 * Clear all credentials from the system keychain
 */
export async function clearCredentials() {
	consola.info('Clearing credentials...')
	const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE)

	if (credentials.length === 0) {
		consola.info('No credentials found')
		return
	}

	consola.info(`Found ${credentials.length} credentials`)

	for (const credential of credentials) {
		consola.info(`Deleting credential for ${credential.account}`)
		await keytar.deletePassword(KEYCHAIN_SERVICE, credential.account)
	}

	consola.success('Credentials cleared')
}
