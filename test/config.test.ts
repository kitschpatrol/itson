// @case-police-ignore MacOS

import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ItsonConfigApp, ItsonConfigTask } from '../src/lib/config'
import {
	DEFAULT_ITSON_CONFIG,
	expandTilde,
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

describe('expandTilde', () => {
	const home = homedir()

	it('should expand a leading ~/ to the home directory', () => {
		expect(expandTilde('~/Applications/AllWork.app')).toBe(`${home}/Applications/AllWork.app`)
	})

	it('should expand a bare ~', () => {
		expect(expandTilde('~')).toBe(home)
	})

	it('should expand ~ directly after = in flag-style arguments', () => {
		expect(expandTilde('--config=~/Applications/settings.json')).toBe(
			`--config=${home}/Applications/settings.json`,
		)
	})

	it('should leave absolute paths and plain values unchanged', () => {
		expect(expandTilde('/opt/homebrew/bin/python3')).toBe('/opt/homebrew/bin/python3')
		expect(expandTilde('interpose')).toBe('interpose')
		expect(expandTilde('')).toBe('')
	})

	it('should not expand ~ in the middle of a value or for other users', () => {
		expect(expandTilde('a~/b')).toBe('a~/b')
		expect(expandTilde('~user/docs')).toBe('~user/docs')
		expect(expandTilde('~foo')).toBe('~foo')
	})
})

describe('tilde expansion', () => {
	const home = homedir()

	it('should expand ~ in command, arguments, localPath, and destination', () => {
		const parsed = itsonConfigSchema.parse({
			applications: [
				{
					name: 'AllWork',
					command: '~/Applications/AllWork.app/Contents/macOS/AllWork',
					arguments: ['--config=~/Applications/settings.json', '~/Applications/data', 'plain'],
					logUpload: {
						bucketName: 'bucket',
						endpoint: 'https://example.com/',
						localPath: '~/Library/Logs/AllWork',
						remotePath: '~/not-a-local-path',
						type: 's3',
					},
					update: {
						artifactPattern: 'zip$',
						destination: '~/Applications/AllWork.app',
						owner: 'owner',
						repo: 'repo',
						type: 'github',
					},
				},
			],
		})

		const app = parsed.applications[0]
		if (app?.update?.type !== 'github' || app.logUpload === undefined) {
			throw new Error('Expected a github update strategy and log upload config')
		}

		expect(app.command).toBe(`${home}/Applications/AllWork.app/Contents/macOS/AllWork`)
		expect(app.arguments).toEqual([
			`--config=${home}/Applications/settings.json`,
			`${home}/Applications/data`,
			'plain',
		])
		expect(app.logUpload.localPath).toBe(`${home}/Library/Logs/AllWork`)
		expect(app.logUpload.remotePath).toBe('~/not-a-local-path')
		expect(app.update.destination).toBe(`${home}/Applications/AllWork.app`)
	})

	it('should leave absolute paths and bare command names unchanged', () => {
		const parsed = itsonConfigSchema.parse({
			tasks: [
				{
					name: 'Reboot Cameras',
					command: '/opt/homebrew/bin/python3',
					arguments: ['/Users/user/reboot_cameras.py'],
					schedule: '50 1 * * *',
				},
				{ name: 'Say', command: 'say', schedule: '@reboot' },
			],
		})

		expect(parsed.tasks[0]?.command).toBe('/opt/homebrew/bin/python3')
		expect(parsed.tasks[0]?.arguments).toEqual(['/Users/user/reboot_cameras.py'])
		expect(parsed.tasks[1]?.command).toBe('say')
	})
})

describe('schedule validation', () => {
	function parseTask(schedule: string) {
		return itsonConfigSchema.safeParse({
			tasks: [{ name: 'Task', command: 'true', schedule }],
		})
	}

	it('should accept cron strings launchd can represent', () => {
		expect(parseTask('50 1 * * *').success).toBe(true)
		expect(parseTask('*/15 8-10 * * 1-5').success).toBe(true)
		expect(parseTask('@reboot').success).toBe(true)
	})

	it('should reject malformed cron strings at load time', () => {
		const result = parseTask('not a cron string')

		expect(result.success).toBe(false)
		expect(z.prettifyError(result.error!)).toContain('Unsupported schedule "not a cron string"')
	})

	it('should reject cron strings launchd cannot represent', () => {
		// Seconds combined with other fields have no launchd equivalent
		const result = parseTask('30 5 * * * *')

		expect(result.success).toBe(false)
		expect(z.prettifyError(result.error!)).toContain('tasks[0].schedule')
	})
})

describe('name validation', () => {
	it('should reject blank names and names containing a path separator', () => {
		const blank = itsonConfigSchema.safeParse({ applications: [{ name: '  ', command: 'app' }] })
		expect(blank.success).toBe(false)

		const slash = itsonConfigSchema.safeParse({
			applications: [{ name: 'All/Work', command: 'app' }],
		})
		expect(slash.success).toBe(false)
		expect(z.prettifyError(slash.error!)).toContain('applications[0].name')
	})

	it('should reject duplicate names within applications or within tasks', () => {
		const result = itsonConfigSchema.safeParse({
			applications: [
				{ name: 'AllWork', command: 'a' },
				{ name: 'AllWork', command: 'b' },
			],
		})

		expect(result.success).toBe(false)
		expect(z.prettifyError(result.error!)).toContain('applications[1].name')
		expect(z.prettifyError(result.error!)).toContain('Duplicate application name "AllWork"')
	})

	it('should allow an application and a task to share a name', () => {
		// They get different launchd label prefixes, so they never collide
		const result = itsonConfigSchema.safeParse({
			applications: [{ name: 'Sync', command: 'a' }],
			tasks: [{ name: 'Sync', command: 'b', schedule: '0 * * * *' }],
		})

		expect(result.success).toBe(true)
	})

	it('should reserve the itson task name', () => {
		const result = itsonConfigSchema.safeParse({
			tasks: [{ name: 'Itson', command: 'b', schedule: '0 * * * *' }],
		})

		expect(result.success).toBe(false)
		expect(z.prettifyError(result.error!)).toContain('reserved')
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
