/* eslint-disable ts/no-unsafe-type-assertion, ts/consistent-type-assertions */

import { describe, expect, it } from 'vitest'
import type { ItsonConfigApplication, ItsonConfigTask } from '../src/lib/config'
import { DEFAULT_ITSON_CONFIG, isApplication, isTask, itsonConfig } from '../src/lib/config'

describe('isTask', () => {
	it('should return true for items with a schedule', () => {
		const task: ItsonConfigTask = {
			arguments: [],
			command: 'my-task',
			name: 'TestTask',
			schedule: '0 * * * *',
		} as ItsonConfigTask

		expect(isTask(task)).toBe(true)
	})

	it('should return false for items without a schedule', () => {
		// The schedule: never type means we must cast through unknown
		const app = {
			arguments: [],
			command: 'my-app',
			name: 'TestApp',
		} as unknown as ItsonConfigApplication

		expect(isTask(app)).toBe(false)
	})

	it('should return true for @reboot schedule', () => {
		const task: ItsonConfigTask = {
			command: 'startup-script',
			name: 'BootTask',
			schedule: '@reboot',
		} as ItsonConfigTask

		expect(isTask(task)).toBe(true)
	})
})

describe('isApplication', () => {
	it('should return true for items without a schedule', () => {
		const app = {
			arguments: [],
			command: 'my-app',
			name: 'TestApp',
		} as unknown as ItsonConfigApplication

		expect(isApplication(app)).toBe(true)
	})

	it('should return false for items with a schedule', () => {
		const task: ItsonConfigTask = {
			command: 'my-task',
			name: 'TestTask',
			schedule: '0 12 * * *',
		} as ItsonConfigTask

		expect(isApplication(task)).toBe(false)
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
					command: 'my-app',
					name: 'App1',
				} as ItsonConfigApplication,
			],
			offline: true,
			runOnStartup: true,
			tasks: [
				{
					command: 'my-task',
					name: 'Task1',
					schedule: '@daily',
				} as ItsonConfigTask,
			],
			verbose: true,
		}

		const result = itsonConfig(config)
		expect(result).toEqual(config)
	})
})
