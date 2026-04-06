/* eslint-disable ts/no-unsafe-type-assertion, ts/consistent-type-assertions */

/**
 * Tests for service.ts launchd integration.
 *
 * These tests exercise real launchd service management on macOS, creating,
 * starting, stopping, and cleaning up actual launchd services.
 *
 * On non-macOS platforms, the tests are skipped.
 */

import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ItsonConfigApplication, ItsonConfigTask } from '../src/lib/config'

const describeOnMac = process.platform === 'darwin' ? describe : describe.skip

describeOnMac('Service Management (macOS)', () => {
	// Use a unique name to avoid collisions with real services
	const testSuffix = `test-${Date.now()}`

	const testApp: ItsonConfigApplication = {
		arguments: ['hello-from-itson-test'],
		command: 'echo',
		name: `E2eApp-${testSuffix}`,
	} as ItsonConfigApplication

	const testTask: ItsonConfigTask = {
		arguments: ['task-output'],
		command: 'echo',
		name: `E2eTask-${testSuffix}`,
		schedule: '0 0 31 12 *', // Dec 31 midnight - won't actually fire during test
	}

	// Clean up all test services after all tests
	afterAll(async () => {
		const { unregisterService } = await import('../src/lib/service')
		try {
			await unregisterService(testApp)
		} catch {
			// OK if already unregistered
		}

		try {
			await unregisterService(testTask)
		} catch {
			// OK if already unregistered
		}
	})

	describe('startService', () => {
		it('should register and start an application service', async () => {
			const { startService } = await import('../src/lib/service')

			// Should not throw
			await startService(testApp)

			// Verify plist file was created
			const label = `com.itson.app.E2eApp-${testSuffix}`
			const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

			const plistContent = await readFile(plistPath, 'utf8')
			expect(plistContent).toContain(label)
			expect(plistContent).toContain('echo')
			expect(plistContent).toContain('hello-from-itson-test')
		})

		it('should register a scheduled task service', async () => {
			const { startService } = await import('../src/lib/service')

			await startService(testTask)

			const label = `com.itson.task.E2eTask-${testSuffix}`
			const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

			const plistContent = await readFile(plistPath, 'utf8')
			expect(plistContent).toContain(label)
			expect(plistContent).toContain('StartCalendarInterval')
		})

		it('should be idempotent (re-registering the same service)', async () => {
			const { startService } = await import('../src/lib/service')

			// Calling startService again should not throw
			await startService(testApp)
		})
	})

	describe('stopService', () => {
		it('should stop a running service without error', async () => {
			const { stopService } = await import('../src/lib/service')

			// Should not throw even if service is already stopped
			await stopService(testApp)
		})
	})

	describe('unregisterService', () => {
		it('should unregister a service and remove its plist', async () => {
			const { startService, unregisterService } = await import('../src/lib/service')

			// First ensure it's registered
			await startService(testTask)

			// Now unregister
			await unregisterService(testTask)

			// Verify plist file was removed
			const label = `com.itson.task.E2eTask-${testSuffix}`
			const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

			const { readFileSafe } = await import('../src/lib/utilities')
			const content = await readFileSafe(plistPath)
			expect(content).toBeUndefined()
		})
	})

	describe('unregisterAll', () => {
		it('should clean up all itson services', async () => {
			const { startService, unregisterAll } = await import('../src/lib/service')

			// Register a test service
			await startService(testApp)

			// Unregister all
			await unregisterAll()

			// Verify the test service plist is gone
			const label = `com.itson.app.E2eApp-${testSuffix}`
			const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)

			const { readFileSafe } = await import('../src/lib/utilities')
			const content = await readFileSafe(plistPath)
			expect(content).toBeUndefined()
		})
	})

	describe('Platform guard', () => {
		it('should have platform check in source', async () => {
			// Verifies the error message exists in the source code
			const source = await readFile(path.join(process.cwd(), 'src', 'lib', 'service.ts'), 'utf8')
			expect(source).toContain("process.platform !== 'darwin'")
			expect(source).toContain('Daemonization is currently only supported on macOS')
		})
	})
})
