/**
 * End-to-end keychain tests using keytar-forked.
 *
 * These tests exercise the real macOS Keychain Services API to verify that
 * credential storage works as it would in production.
 *
 * On CI (GitHub Actions macOS runners), a temporary keychain is created and
 * configured before these tests run. See the CI workflow for setup details.
 *
 * These tests use a unique service name to avoid interfering with any real
 * itson credentials on developer machines.
 *
 * On non-macOS platforms, the entire test suite is skipped.
 */

import type keytarModule from 'keytar-forked'
import { afterAll, describe, expect, it } from 'vitest'

const TEST_SERVICE = `itson-cli-test-${Date.now()}`

// Skip on non-macOS platforms (keytar requires macOS Keychain / Linux libsecret)
const isMac = process.platform === 'darwin'
const describeOnMac = isMac ? describe : describe.skip

// Only import keytar on macOS to avoid native module load errors on Linux
let kt: typeof keytarModule
if (isMac) {
	const keytarImport = await import('keytar-forked')
	kt = keytarImport.default
}

describeOnMac('Keychain Integration (macOS)', () => {
	// Clean up any leftover test credentials
	afterAll(async () => {
		const credentials = await kt.findCredentials(TEST_SERVICE)
		for (const cred of credentials) {
			await kt.deletePassword(TEST_SERVICE, cred.account)
		}
	})

	describe('setPassword / getPassword', () => {
		it('should store and retrieve a password', async () => {
			await kt.setPassword(TEST_SERVICE, 'test-account', 'test-secret-value')

			const result = await kt.getPassword(TEST_SERVICE, 'test-account')
			expect(result).toBe('test-secret-value')
		})

		it('should return null for a non-existent account', async () => {
			const result = await kt.getPassword(TEST_SERVICE, 'non-existent-account')
			expect(result).toBeNull()
		})

		it('should overwrite existing password', async () => {
			await kt.setPassword(TEST_SERVICE, 'overwrite-test', 'original-value')
			await kt.setPassword(TEST_SERVICE, 'overwrite-test', 'updated-value')

			const result = await kt.getPassword(TEST_SERVICE, 'overwrite-test')
			expect(result).toBe('updated-value')
		})

		it('should handle special characters in passwords', async () => {
			const specialPassword = 'p@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?/~`'
			await kt.setPassword(TEST_SERVICE, 'special-chars', specialPassword)

			const result = await kt.getPassword(TEST_SERVICE, 'special-chars')
			expect(result).toBe(specialPassword)
		})

		it('should handle unicode in passwords', async () => {
			const unicodePassword = '密码测试 パスワード 🔐🔑'
			await kt.setPassword(TEST_SERVICE, 'unicode-test', unicodePassword)

			const result = await kt.getPassword(TEST_SERVICE, 'unicode-test')
			expect(result).toBe(unicodePassword)
		})

		it('should handle long passwords', async () => {
			const longPassword = 'a'.repeat(10_000)
			await kt.setPassword(TEST_SERVICE, 'long-password', longPassword)

			const result = await kt.getPassword(TEST_SERVICE, 'long-password')
			expect(result).toBe(longPassword)
		})

		it('should handle very short password', async () => {
			await kt.setPassword(TEST_SERVICE, 'short-password', 'x')

			const result = await kt.getPassword(TEST_SERVICE, 'short-password')
			expect(result).toBe('x')
		})
	})

	describe('deletePassword', () => {
		it('should delete an existing password and return true', async () => {
			await kt.setPassword(TEST_SERVICE, 'to-delete', 'delete-me')

			const deleted = await kt.deletePassword(TEST_SERVICE, 'to-delete')
			expect(deleted).toBe(true)

			const result = await kt.getPassword(TEST_SERVICE, 'to-delete')
			expect(result).toBeNull()
		})

		it('should return false when deleting a non-existent password', async () => {
			const deleted = await kt.deletePassword(TEST_SERVICE, 'never-existed')
			expect(deleted).toBe(false)
		})
	})

	describe('findCredentials', () => {
		const findService = `${TEST_SERVICE}-find`

		afterAll(async () => {
			const credentials = await kt.findCredentials(findService)
			for (const cred of credentials) {
				await kt.deletePassword(findService, cred.account)
			}
		})

		it('should return empty array when no credentials exist', async () => {
			const emptyService = `${TEST_SERVICE}-empty-${Date.now()}`
			const credentials = await kt.findCredentials(emptyService)
			expect(credentials).toEqual([])
		})

		it('should find all credentials for a service', async () => {
			await kt.setPassword(findService, 'account-1', 'secret-1')
			await kt.setPassword(findService, 'account-2', 'secret-2')
			await kt.setPassword(findService, 'account-3', 'secret-3')

			const credentials = await kt.findCredentials(findService)

			expect(credentials).toHaveLength(3)

			const accounts = credentials.map((c) => c.account).toSorted()
			expect(accounts).toEqual(['account-1', 'account-2', 'account-3'])

			// Verify passwords are included
			const cred1 = credentials.find((c) => c.account === 'account-1')
			expect(cred1?.password).toBe('secret-1')
		})

		it('should reflect deletions in findCredentials', async () => {
			await kt.deletePassword(findService, 'account-2')

			const credentials = await kt.findCredentials(findService)
			expect(credentials).toHaveLength(2)

			const accounts = credentials.map((c) => c.account).toSorted()
			expect(accounts).toEqual(['account-1', 'account-3'])
		})
	})

	describe('Production-like credential workflow', () => {
		const workflowService = `${TEST_SERVICE}-workflow`

		afterAll(async () => {
			const credentials = await kt.findCredentials(workflowService)
			for (const cred of credentials) {
				await kt.deletePassword(workflowService, cred.account)
			}
		})

		it('should simulate the GitHub PAT storage workflow', async () => {
			const account = 'github-pat'
			const pat = 'github_pat_test_1234567890abcdef'

			// Initially no PAT stored
			const initial = await kt.getPassword(workflowService, account)
			expect(initial).toBeNull()

			// Store PAT (simulates first-run prompt)
			await kt.setPassword(workflowService, account, pat)

			// Retrieve PAT (simulates subsequent runs)
			const stored = await kt.getPassword(workflowService, account)
			expect(stored).toBe(pat)
		})

		it('should simulate the S3 credentials workflow', async () => {
			const accessKeyAccount = 's3-access-key'
			const secretKeyAccount = 's3-secret-key'
			const accessKey = 'AKIAIOSFODNN7EXAMPLE'
			const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

			// Store both credentials
			await kt.setPassword(workflowService, accessKeyAccount, accessKey)
			await kt.setPassword(workflowService, secretKeyAccount, secretKey)

			// Retrieve both
			const storedAccess = await kt.getPassword(workflowService, accessKeyAccount)
			const storedSecret = await kt.getPassword(workflowService, secretKeyAccount)
			expect(storedAccess).toBe(accessKey)
			expect(storedSecret).toBe(secretKey)
		})

		it('should simulate the reset command (clear all credentials)', async () => {
			// Find all credentials
			const credentials = await kt.findCredentials(workflowService)
			expect(credentials.length).toBeGreaterThan(0)

			// Delete each one (mirrors reset.ts clearCredentials logic)
			for (const credential of credentials) {
				await kt.deletePassword(workflowService, credential.account)
			}

			// Verify all cleared
			const remaining = await kt.findCredentials(workflowService)
			expect(remaining).toHaveLength(0)
		})
	})

	describe('Concurrent access', () => {
		const concurrentService = `${TEST_SERVICE}-concurrent`

		afterAll(async () => {
			const credentials = await kt.findCredentials(concurrentService)
			for (const cred of credentials) {
				await kt.deletePassword(concurrentService, cred.account)
			}
		})

		it('should handle concurrent writes to different accounts', async () => {
			const writes = Array.from({ length: 10 }, async (_, i) =>
				kt.setPassword(concurrentService, `concurrent-${i}`, `value-${i}`),
			)

			await Promise.all(writes)

			// Verify all were written
			const credentials = await kt.findCredentials(concurrentService)
			expect(credentials).toHaveLength(10)
		})

		it('should handle concurrent reads', async () => {
			const reads = Array.from({ length: 10 }, async (_, i) =>
				kt.getPassword(concurrentService, `concurrent-${i}`),
			)

			const results = await Promise.all(reads)

			for (let i = 0; i < 10; i++) {
				expect(results[i]).toBe(`value-${i}`)
			}
		})
	})
})
