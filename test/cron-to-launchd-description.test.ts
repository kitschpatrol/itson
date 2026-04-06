import { describe, expect, it } from 'vitest'
import { getCronStringDescription } from '../src/lib/utilities/cron-to-launchd'

const EVERY_HOUR_REGEX = /every hour/i
const DAILY_REGEX = /day|midnight|12:00 AM/i
const EVERY_5_MINUTES_REGEX = /every 5 minutes/i
const HOURLY_REGEX = /hour/i
const WEEKLY_REGEX = /week|sunday/i
const MONTHLY_REGEX = /month|day 1/i
const YEARLY_REGEX = /year|january/i

describe('getCronStringDescription', () => {
	it('should return human-readable description for standard cron expressions', () => {
		expect(getCronStringDescription('0 * * * *')).toMatch(EVERY_HOUR_REGEX)
		expect(getCronStringDescription('0 0 * * *')).toMatch(DAILY_REGEX)
		expect(getCronStringDescription('*/5 * * * *')).toMatch(EVERY_5_MINUTES_REGEX)
	})

	it('should return human-readable description for special strings', () => {
		expect(getCronStringDescription('@daily')).toMatch(DAILY_REGEX)
		expect(getCronStringDescription('@hourly')).toMatch(HOURLY_REGEX)
		expect(getCronStringDescription('@weekly')).toMatch(WEEKLY_REGEX)
		expect(getCronStringDescription('@monthly')).toMatch(MONTHLY_REGEX)
		expect(getCronStringDescription('@yearly')).toMatch(YEARLY_REGEX)
	})

	it('should return original string for unparsable expressions', () => {
		const invalid = 'not-a-cron-expression'
		expect(getCronStringDescription(invalid)).toBe(invalid)
	})

	it('should handle complex expressions', () => {
		const desc = getCronStringDescription('0,30 9-17 * * 1-5')
		// Should produce something meaningful (not throw)
		expect(desc.length).toBeGreaterThan(0)
	})
})
