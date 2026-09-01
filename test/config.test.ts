/* eslint-disable ts/consistent-type-assertions */

import { describe, expect, it } from 'vitest'
import type { ItsonConfigApp, ItsonConfigTask } from '../src/lib/config'
import { DEFAULT_ITSON_CONFIG, isApp, isTask, itsonConfig } from '../src/lib/config'

describe('isTask', () => {
	it('should return true for items with a schedule', () => {
		const task: ItsonConfigTask = {
			name: 'TestTask',
			command: 'my-task',
			arguments: [],
			schedule: '0 * * * *',
		}

		expect(isTask(task)).toBe(true)
	})

	it('should return false for items without a schedule', () => {
		// The schedule: never type means we must cast through unknown
		const app = {
			name: 'TestApp',
			command: 'my-app',
			arguments: [],
		} as unknown as ItsonConfigApp

		expect(isTask(app)).toBe(false)
	})

	it('should return true for @reboot schedule', () => {
		const task: ItsonConfigTask = {
			name: 'BootTask',
			command: 'startup-script',
			schedule: '@reboot',
		}

		expect(isTask(task)).toBe(true)
	})
})

describe('isApp', () => {
	it('should return true for items without a schedule', () => {
		const app = {
			name: 'TestApp',
			command: 'my-app',
			arguments: [],
		} as unknown as ItsonConfigApp

		expect(isApp(app)).toBe(true)
	})

	it('should return false for items with a schedule', () => {
		const task: ItsonConfigTask = {
			name: 'TestTask',
			command: 'my-task',
			schedule: '0 12 * * *',
		}

		expect(isApp(task)).toBe(false)
	})
})

describe('DEFAULT_ITSON_CONFIG', () => {
	it('should have expected default values', () => {
		expect(DEFAULT_ITSON_CONFIG).toEqual({
			applications: [],
			offline: false,
			runOnStartup: false,
			tasks: [],
			verbose: false,
		})
	})

	it('should have empty arrays for applications and tasks', () => {
		expect(DEFAULT_ITSON_CONFIG.applications).toHaveLength(0)
		expect(DEFAULT_ITSON_CONFIG.tasks).toHaveLength(0)
	})
})

describe('itsonConfig', () => {
	it('should return the same config passed to it', () => {
		const config = {
			applications: [
				{
					name: 'App1',
					command: 'my-app',
				} as ItsonConfigApp,
			],
			offline: true,
			runOnStartup: true,
			tasks: [
				{
					name: 'Task1',
					command: 'my-task',
					schedule: '@daily',
				} as ItsonConfigTask,
			],
			verbose: true,
		}

		const result = itsonConfig(config)
		expect(result).toEqual(config)
	})
})
