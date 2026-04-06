/* eslint-disable ts/naming-convention, ts/no-unsafe-type-assertion */

import plist from 'plist'
import { describe, expect, it } from 'vitest'
import { createApplicationPlist } from '../src/lib/utilities/plist-builder'

const OUT_LOG_REGEX = /com\.itson\.app\.LogTest\.out\.log$/
const ERR_LOG_REGEX = /com\.itson\.app\.LogTest\.err\.log$/

type PlistRecord = Record<string, unknown>
type PlistEnv = Record<string, string>

describe('createApplicationPlist', () => {
	it('should generate a valid plist for a keep-alive application', () => {
		const result = createApplicationPlist({
			command: '/usr/local/bin/my-app',
			keepAlive: true,
			label: 'com.itson.app.TestApp',
			userPath: '/usr/local/bin:/usr/bin:/bin',
		})

		const parsed = plist.parse(result) as PlistRecord

		expect(parsed.Label).toBe('com.itson.app.TestApp')
		expect(parsed.ProgramArguments).toEqual(['/usr/bin/env', '/usr/local/bin/my-app'])
		expect(parsed.KeepAlive).toEqual({
			AfterInitialDemand: true,
			Crashed: true,
			SuccessfulExit: true,
		})
		expect(parsed.SessionCreate).toBe(false)
		expect(parsed.LimitLoadToSessionType).toBe('Aqua')

		const env = parsed.EnvironmentVariables as PlistEnv
		expect(env.PATH).toBe('/usr/local/bin:/usr/bin:/bin')
		expect(env.NODE_ENV).toBe('production')
	})

	it('should generate a valid plist for a non-keep-alive task', () => {
		const result = createApplicationPlist({
			command: '/usr/local/bin/my-task',
			keepAlive: false,
			label: 'com.itson.task.Cleanup',
			userPath: '/usr/bin:/bin',
		})

		const parsed = plist.parse(result) as PlistRecord

		expect(parsed.Label).toBe('com.itson.task.Cleanup')
		expect(parsed.KeepAlive).toBe(false)
		// Without schedule, should have RunAtLoad: false
		expect(parsed.RunAtLoad).toBe(false)
	})

	it('should include schedule from cron expression', () => {
		const result = createApplicationPlist({
			command: '/usr/local/bin/my-task',
			keepAlive: false,
			label: 'com.itson.task.Scheduled',
			schedule: '0 12 * * *',
			userPath: '/usr/bin:/bin',
		})

		const parsed = plist.parse(result) as PlistRecord

		// Should have StartCalendarInterval instead of RunAtLoad
		expect(parsed.StartCalendarInterval).toBeDefined()
		expect(parsed.RunAtLoad).toBeUndefined()
	})

	it('should include @reboot schedule as RunAtLoad', () => {
		const result = createApplicationPlist({
			command: 'itson',
			keepAlive: false,
			label: 'com.itson.task.Itson',
			schedule: '@reboot',
			userPath: '/usr/bin:/bin',
		})

		const parsed = plist.parse(result) as PlistRecord
		expect(parsed.RunAtLoad).toBe(true)
	})

	it('should include additional arguments', () => {
		const result = createApplicationPlist({
			arguments: ['--verbose', '--config', '/etc/myapp.conf'],
			command: '/usr/local/bin/my-app',
			keepAlive: true,
			label: 'com.itson.app.WithArgs',
			userPath: '/usr/bin:/bin',
		})

		const parsed = plist.parse(result) as PlistRecord
		expect(parsed.ProgramArguments).toEqual([
			'/usr/bin/env',
			'/usr/local/bin/my-app',
			'--verbose',
			'--config',
			'/etc/myapp.conf',
		])
	})

	it('should set correct log paths', () => {
		const result = createApplicationPlist({
			command: 'my-app',
			keepAlive: true,
			label: 'com.itson.app.LogTest',
			userPath: '/usr/bin',
		})

		const parsed = plist.parse(result) as PlistRecord
		expect(parsed.StandardOutPath).toMatch(OUT_LOG_REGEX)
		expect(parsed.StandardErrorPath).toMatch(ERR_LOG_REGEX)
	})

	it('should use custom log directory path', () => {
		const result = createApplicationPlist({
			command: 'my-app',
			keepAlive: true,
			label: 'com.itson.app.CustomLog',
			logDirectoryPath: '/tmp/logs',
			userPath: '/usr/bin',
		})

		const parsed = plist.parse(result) as PlistRecord
		expect(parsed.StandardOutPath).toBe('/tmp/logs/com.itson.app.CustomLog.out.log')
		expect(parsed.StandardErrorPath).toBe('/tmp/logs/com.itson.app.CustomLog.err.log')
	})

	it('should produce valid XML that can be round-tripped', () => {
		const result = createApplicationPlist({
			arguments: ['--port', '8080'],
			command: 'node',
			keepAlive: true,
			label: 'com.itson.app.RoundTrip',
			schedule: '*/15 * * * *',
			userPath: '/usr/local/bin:/usr/bin',
		})

		// Parse and rebuild should produce equivalent structure
		const parsed = plist.parse(result)
		const rebuilt = plist.build(parsed)
		const reParsed = plist.parse(rebuilt)

		expect(reParsed).toEqual(parsed)
	})

	it('should handle empty arguments array', () => {
		const result = createApplicationPlist({
			arguments: [],
			command: 'my-app',
			keepAlive: false,
			label: 'com.itson.app.EmptyArgs',
			userPath: '/usr/bin',
		})

		const parsed = plist.parse(result) as PlistRecord
		expect(parsed.ProgramArguments).toEqual(['/usr/bin/env', 'my-app'])
	})
})
