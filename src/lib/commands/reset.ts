import { consola } from 'consola'
import keytar from 'keytar-forked'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import { unregisterAll } from '../service'

async function clearCredentials() {
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

/**
 * Clear any credentials stored in the system keychain, and remove any registered services
 */
export async function reset() {
	consola.info('Resetting itsup')
	await unregisterAll()
	await clearCredentials()
}
