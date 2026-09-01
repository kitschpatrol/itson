import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ItsonConfigApp, ItsonConfigTask } from '../src/lib/config'
import {
	DEFAULT_ITSON_CONFIG,
	isApp,
	isTask,
	itsonConfig,
	itsonConfigSchema,
} from '../src/lib/config'

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
		const app: ItsonConfigApp = {
			name: 'TestApp',
			command: 'my-app',
			arguments: [],
		}

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
		const app: ItsonConfigApp = {
			name: 'TestApp',
			command: 'my-app',
			arguments: [],
		}

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
		const config = itsonConfig({
			applications: [
				{
					name: 'App1',
					command: 'my-app',
				},
			],
			offline: true,
			runOnStartup: true,
			tasks: [
				{
					name: 'Task1',
					command: 'my-task',
					schedule: '@daily',
				},
			],
			verbose: true,
		})

		const result = itsonConfig(config)
		expect(result).toEqual(config)
	})
})

const ARTIFACT_PATTERN_REGEX = /^App[\-.]Bundle.+\.zip$/v

describe('itsonConfigSchema', () => {
	it('should fill defaults for an empty config', () => {
		expect(itsonConfigSchema.parse({})).toEqual(DEFAULT_ITSON_CONFIG)
	})

	it('should strip unknown keys like $schema', () => {
		const parsed = itsonConfigSchema.parse({ $schema: 'https://example.com/schema.json' })
		expect(parsed).toEqual(DEFAULT_ITSON_CONFIG)
	})

	it('should accept a RegExp instance for artifactPattern', () => {
		const parsed = itsonConfigSchema.parse({
			applications: [
				{
					name: 'App',
					command: 'app',
					update: {
						artifactPattern: ARTIFACT_PATTERN_REGEX,
						destination: '/Applications/App.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		const update = parsed.applications[0]?.update
		if (update?.type !== 'github') {
			throw new Error('Expected a github update strategy')
		}

		expect(update.artifactPattern).toBeInstanceOf(RegExp)
		expect(update.artifactPattern.source).toBe(String.raw`^App[\-.]Bundle.+\.zip$`)
		expect(update.artifactPattern.flags).toBe('v')
	})

	it('should compile a pattern source string for artifactPattern', () => {
		const parsed = itsonConfigSchema.parse({
			applications: [
				{
					name: 'App',
					command: 'app',
					update: {
						artifactPattern: String.raw`^App.+\.zip$`,
						destination: '/Applications/App.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		const update = parsed.applications[0]?.update
		if (update?.type !== 'github') {
			throw new Error('Expected a github update strategy')
		}

		expect(update.artifactPattern).toBeInstanceOf(RegExp)
		expect(update.artifactPattern.source).toBe(String.raw`^App.+\.zip$`)
		expect(update.artifactPattern.flags).toBe('')
		expect(update.artifactPattern.test('App-1.0.0.zip')).toBe(true)
	})

	it('should compile a { source, flags } object for artifactPattern', () => {
		const parsed = itsonConfigSchema.parse({
			applications: [
				{
					name: 'App',
					command: 'app',
					update: {
						artifactPattern: { flags: 'iu', source: '^foo.*bar$' },
						destination: '/Applications/App.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		const update = parsed.applications[0]?.update
		if (update?.type !== 'github') {
			throw new Error('Expected a github update strategy')
		}

		expect(update.artifactPattern).toBeInstanceOf(RegExp)
		expect(update.artifactPattern.flags).toBe('iu')
		expect(update.artifactPattern.test('FOO anything BAR')).toBe(true)
	})

	it('should reject an invalid regular expression source', () => {
		const result = itsonConfigSchema.safeParse({
			applications: [
				{
					name: 'App',
					command: 'app',
					update: {
						artifactPattern: '[unclosed',
						destination: '/Applications/App.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		expect(result.success).toBe(false)

		if (result.success) {
			throw new Error('Expected parsing to fail')
		}

		expect(z.prettifyError(result.error)).toContain('Invalid regular expression')
	})

	it('should reject invalid regular expression flags', () => {
		const result = itsonConfigSchema.safeParse({
			applications: [
				{
					name: 'App',
					command: 'app',
					update: {
						artifactPattern: { flags: 'zzz', source: '^foo$' },
						destination: '/Applications/App.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		expect(result.success).toBe(false)
	})

	it('should reject a schedule on an application', () => {
		const result = itsonConfigSchema.safeParse({
			applications: [
				{
					name: 'App',
					command: 'app',
					schedule: '0 * * * *',
				},
			],
		})

		expect(result.success).toBe(false)
	})

	it('should reject a task without a schedule', () => {
		const result = itsonConfigSchema.safeParse({
			tasks: [
				{
					name: 'Task',
					command: 'task',
				},
			],
		})

		expect(result.success).toBe(false)
	})
})
