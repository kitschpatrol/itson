// Tests adapted from https://github.com/randomn4me/crontab-to-launchd

import plist from 'plist'
import { describe, expect, it } from 'vitest'
import type { LaunchdPlistFragment } from '../src/lib/utilities/cron-to-launchd'
import { cronToPlistFragment } from '../src/lib/utilities/cron-to-launchd'

/**
 * Helper to parse crontab and generate XML
 */
function parseAndGenerate(crontabExpr: string): [LaunchdPlistFragment, string] {
	const entry = cronToPlistFragment(crontabExpr)
	const xmlOutput = plist.build(entry)

	return [entry, xmlOutput]
}

/**
 * Count the number of scheduling intervals (Calendar or Start)
 */
function countIntervals(xmlOutput: string): number {
	// Check for StartInterval (simple repeating jobs)
	if (xmlOutput.includes('<key>StartInterval</key>')) {
		return 1 // StartInterval represents one repeating schedule
	}

	// Check for RunAtLoad (boot-time jobs)
	if (xmlOutput.includes('<key>RunAtLoad</key>')) {
		return 1
	}

	// Find StartCalendarInterval
	const calendarMatch = /<key>StartCalendarInterval<\/key>\s*<(array|dict)>/.exec(xmlOutput)
	if (!calendarMatch) {
		return 0
	}

	const nextTag = calendarMatch[1]
	if (nextTag === 'array') {
		// Count dict elements inside array
		const afterKey = xmlOutput.slice(
			Math.max(0, xmlOutput.indexOf('<key>StartCalendarInterval</key>')),
		)
		const arrayMatch = /<array>([\s\S]*?)<\/array>/.exec(afterKey)
		if (arrayMatch) {
			const arrayContent = arrayMatch[1]
			const dictMatches = arrayContent.match(/<dict>/g)
			return dictMatches ? dictMatches.length : 0
		}
	} else if (nextTag === 'dict') {
		return 1
	}

	return 0
}

/**
 * Comprehensive tests covering all possible crontab field patterns.
 * Tests interval counting to ensure correct expansion of cron expressions.
 */
describe('ComprehensivePatterns', () => {
	// MINUTE FIELD TESTS (0-59)
	describe('Minute Field', () => {
		it('should handle single minute values', () => {
			const testCases: Array<[string, number]> = [
				['0 * * * *', 1], // Start of hour
				['30 * * * *', 1], // Half past
				['59 * * * *', 1], // End of hour
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [entry, xml] = parseAndGenerate(cronExpr)

				expect([0, 30, 59]).toContain(entry.StartCalendarInterval![0].Minute)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle minute ranges', () => {
			const testCases: Array<[string, number]> = [
				['0-5 * * * *', 6], // Start range
				['15-20 * * * *', 6], // Middle range
				['55-59 * * * *', 5], // End range
				['0-59 * * * *', 60], // Full range
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle minute lists', () => {
			const testCases: Array<[string, number]> = [
				['0,30 * * * *', 2], // Two values
				['15,30,45 * * * *', 3], // Three values
				['0,15,30,45 * * * *', 4], // Four values
				['5,10,15,20,25 * * * *', 5], // Five values
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [_, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle minute steps', () => {
			const testCases: Array<[string, number]> = [
				['*/1 * * * *', 60], // Every minute
				['*/5 * * * *', 12], // Every 5 minutes
				['*/10 * * * *', 6], // Every 10 minutes
				['*/15 * * * *', 4], // Every 15 minutes
				['*/20 * * * *', 3], // Every 20 minutes
				['*/30 * * * *', 2], // Every 30 minutes
				['0-30/5 0 * * *', 7], // Every 5 minutes from 0-30 at hour 0
				['10-50/10 0 * * *', 5], // Every 10 minutes from 10-50 at hour 0
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				const intervals = countIntervals(xml)
				expect(intervals).toBe(expectedIntervals)
			}
		})
	})

	// HOUR FIELD TESTS (0-23)
	describe('Hour Field', () => {
		it('should handle single hour values', () => {
			const testCases: Array<[string, number]> = [
				['0 0 * * *', 1], // Midnight
				['0 12 * * *', 1], // Noon
				['0 23 * * *', 1], // End of day
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [entry, xml] = parseAndGenerate(cronExpr)
				expect([0, 12, 23]).toContain(entry.StartCalendarInterval![0].Hour)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle hour ranges', () => {
			const testCases: Array<[string, number]> = [
				['0 0-5 * * *', 6], // Early morning
				['0 9-17 * * *', 9], // Business hours
				['0 18-23 * * *', 6], // Evening
				['0 0-23 * * *', 24], // Full day
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle hour lists', () => {
			const testCases: Array<[string, number]> = [
				['0 9,17 * * *', 2], // Start and end of work
				['0 6,12,18 * * *', 3], // Three meals
				['0 0,6,12,18 * * *', 4], // Four times daily
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle hour steps', () => {
			const testCases: Array<[string, number]> = [
				['0 */2 * * *', 12], // Every 2 hours
				['0 */3 * * *', 8], // Every 3 hours
				['0 */4 * * *', 6], // Every 4 hours
				['0 */6 * * *', 4], // Every 6 hours
				['0 */12 * * *', 2], // Every 12 hours
				['0 8-20/2 * * *', 7], // Every 2 hours from 8-20
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})
	})

	// DAY FIELD TESTS (1-31)
	describe('Day Field', () => {
		it('should handle single day values', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1 * *', 1], // First of month
				['0 0 15 * *', 1], // Mid-month
				['0 0 31 * *', 1], // End of month
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [entry, xml] = parseAndGenerate(cronExpr)
				expect([1, 15, 31]).toContain(entry.StartCalendarInterval![0].Day)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle day ranges', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1-7 * *', 7], // First week
				['0 0 15-21 * *', 7], // Mid-month week
				['0 0 25-31 * *', 7], // End of month
				['0 0 1-31 * *', 31], // Full month
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle day lists', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1,15 * *', 2], // Bi-monthly
				['0 0 1,10,20 * *', 3], // Three times a month
				['0 0 1,8,15,22 * *', 4], // Weekly-ish
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle day steps', () => {
			const testCases: Array<[string, number]> = [
				['0 0 */2 * *', 16], // Every other day (31/2 + 1)
				['0 0 */5 * *', 7], // Every 5 days
				['0 0 */10 * *', 4], // Every 10 days
				['0 0 1-15/3 * *', 5], // Every 3 days for first half
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toEqual(expectedIntervals)
			}
		})
	})

	// MONTH FIELD TESTS (1-12)
	describe('Month Field', () => {
		it('should handle single month values', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1 1 *', 1], // January
				['0 0 1 6 *', 1], // June
				['0 0 1 12 *', 1], // December
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [entry, xml] = parseAndGenerate(cronExpr)
				expect([1, 6, 12]).toContain(entry.StartCalendarInterval![0].Month)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle month ranges', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1 1-3 *', 3], // Q1
				['0 0 1 4-6 *', 3], // Q2
				['0 0 1 10-12 *', 3], // Q4
				['0 0 1 1-12 *', 12], // Full year
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle month lists', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1 1,7 *', 2], // Jan and July
				['0 0 1 3,6,9,12 *', 4], // Quarterly
				['0 0 1 1,3,5,7,9,11 *', 6], // Odd months
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle month steps', () => {
			const testCases: Array<[string, number]> = [
				['0 0 1 */2 *', 6], // Every other month
				['0 0 1 */3 *', 4], // Quarterly
				['0 0 1 */4 *', 3], // Every 4 months
				['0 0 1 */6 *', 2], // Biannually
				['0 0 1 1-6/2 *', 3], // Every other month, first half
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})
	})

	// WEEKDAY FIELD TESTS (0-7, 0=Sunday, 7=Sunday)
	describe('Weekday Field', () => {
		it('should handle single weekday values', () => {
			const testCases: Array<[string, number]> = [
				['0 0 * * 0', 1], // Sunday
				['0 0 * * 1', 1], // Monday
				['0 0 * * 5', 1], // Friday
				['0 0 * * 7', 1], // Sunday (alternative)
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [entry, xml] = parseAndGenerate(cronExpr)
				expect([0, 1, 5, 7]).toContain(entry.StartCalendarInterval![0].Weekday)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle weekday ranges', () => {
			const testCases: Array<[string, number]> = [
				['0 0 * * 1-5', 5], // Weekdays
				['0 0 * * 6-7', 2], // Weekend (Sat-Sun)
				['0 0 * * 0-6', 7], // Full week
				['0 0 * * 2-4', 3], // Tue-Thu
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle weekday lists', () => {
			const testCases: Array<[string, number]> = [
				['0 0 * * 1,3,5', 3], // MWF
				['0 0 * * 2,4', 2], // TTh
				['0 0 * * 6,0', 2], // Weekend
				['0 0 * * 1,2,3,4,5', 5], // Weekdays
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})

		it('should handle weekday steps', () => {
			const testCases: Array<[string, number]> = [
				['0 0 * * */2', 4], // Every other day (0,2,4,6)
				['0 0 * * */3', 3], // Every third day (0,3,6)
				['0 0 * * 1-5/2', 3], // Every other weekday (1,3,5)
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBe(expectedIntervals)
			}
		})
	})

	// COMPLEX COMBINATION TESTS
	describe('Complex Combinations', () => {
		it('should handle complex combinations across multiple fields', () => {
			const testCases: Array<[string, number]> = [
				// Multiple minutes with specific times
				['0,30 9,17 * * *', 4], // 9:00, 9:30, 17:00, 17:30
				['*/15 8-10 * * 1-5', 60], // Every 15min, 8-10am, weekdays (4*3*5=60)

				// Multiple time fields with days
				['0,30 */2 1,15 * *', 48], // Author thinks 2 combinations, because "Days take priority", but not sure...
				['0,30 12 1,15 * *', 4], // Author thinks 2 combinations, because "Days take priority", but not sure...

				// Business hours patterns
				['*/20 9-17 * * 1-5', 135], // Every 20min during business hours (3*9*5=135)
				['0 */3 * * 6,0', 16], // Every 3hrs on weekends (8*2=16)

				// Monthly patterns with time
				['15,45 10,14,18 1 * *', 6], // Multiple times on single day (2*3=6)
				['0 8 1,15 */2 *', 12], // Author thinks 2 combinations, because "Days take priority", but not sure...

				// Complex weekday patterns
				['30 */4 * * 1,3,5', 18], // Every 4hrs on MWF (6*3=18)
				['0,20,40 6-22 * * 1-5', 255], // Every 20min, 6am-10pm, weekdays (3*17*5=255)

				// Simple combinations
				['0 9,12,15 * * 1-5', 15], // 3 times daily on weekdays (3*5=15)
				['30 */2 * * 6,0', 24], // Every 2hrs at :30 on weekends (12*2=24)
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [_, xml] = parseAndGenerate(cronExpr)
				const intervals = countIntervals(xml)
				expect(intervals).toBe(expectedIntervals)
			}
		})
	})

	// EDGE CASES AND BOUNDARY VALUES
	describe('Edge Cases and Boundaries', () => {
		it('should handle boundary values for all fields', () => {
			const testCases: Array<[string, number]> = [
				// Minute boundaries
				['0 0 1 1 0', 1], // All minimum values
				['59 23 31 12 7', 1], // All maximum values

				// Edge ranges
				['0-0 0-0 1-1 1-1 0-0', 1], // Single value ranges
				['59-59 23-23 31-31 12-12 7-7', 1], // Single value ranges at max

				// Step at boundaries
				['*/59 */23 */31 */12 */7', 1], // Large steps with wildcards
				['0-0/1 0-0/1 1-1/1 1-1/1 0-0/1', 1], // Single value ranges with step
			]

			for (const [cronExpr, expectedIntervals] of testCases) {
				const [, xml] = parseAndGenerate(cronExpr)
				expect(countIntervals(xml)).toBeGreaterThanOrEqual(expectedIntervals)
			}
		})

		it('should handle all fields as wildcards', () => {
			const [, xml] = parseAndGenerate('* * * * *')
			// This should generate many intervals for every minute
			expect(xml).toContain('StartCalendarInterval')
		})

		// Different from upstream implementation...
		it('should wrap Sunday to 0 with both representations (0 and 7)', () => {
			const [entry1, xml1] = parseAndGenerate('0 0 * * 0')
			const [entry2, xml2] = parseAndGenerate('0 0 * * 7')

			// Both should parse successfully
			expect(entry1.StartCalendarInterval![0].Weekday).toBe(0)
			expect(entry2.StartCalendarInterval![0].Weekday).toBe(0)

			// Both should generate valid XML
			expect(countIntervals(xml1)).toBe(1)
			expect(countIntervals(xml2)).toBe(1)
		})

		it('should handle February 29th', () => {
			// This should work even though Feb 29 doesn't exist every year
			const [entry, xml] = parseAndGenerate('0 0 29 2 *')
			expect(entry.StartCalendarInterval![0].Day).toBe(29)
			expect(entry.StartCalendarInterval![0].Month).toBe(2)
			expect(countIntervals(xml)).toBe(1)
		})

		// Different from upstream implementation...
		it('should throw an error for invalid day-month combinations', () => {
			expect(() => parseAndGenerate('0 0 31 2 *')).toThrow(
				'Invalid explicit day of month definition',
			)
			expect(() => parseAndGenerate('0 0 31 4 *')).toThrow(
				'Invalid explicit day of month definition',
			)
			expect(() => parseAndGenerate('0 0 30 2 *')).toThrow(
				'Invalid explicit day of month definition',
			)
		})
	})

	// PERFORMANCE TESTS
	describe('Performance', () => {
		it('should handle large combinations without error', () => {
			const testCases: Array<[string, string]> = [
				['* * * * *', 'Every minute'],
				['*/1 * * * *', 'Every minute explicit'],
				['* */1 * * *', 'Every minute of every hour'],
				// ['0-59 0-23 1-31 1-12 0-6', 'Full ranges'], // This throws..., different from upstream implementation...
			]

			for (const [cronExpr, _] of testCases) {
				const [_, xml] = parseAndGenerate(cronExpr)
				// Should complete without error, even if it generates many intervals
				expect(xml.length).toBeGreaterThan(0)
			}
		})
	})

	// SPECIAL STRING EQUIVALENCE
	describe('Special Strings', () => {
		it('should generate equivalent intervals to their expansions', () => {
			const equivalences: Array<[string, string]> = [
				['@daily', '0 0 * * *'],
				['@hourly', '0 * * * *'],
				['@weekly', '0 0 * * 0'],
				['@monthly', '0 0 1 * *'],
				['@yearly', '0 0 1 1 *'],
			]

			for (const [special, explicit] of equivalences) {
				const [, xml1] = parseAndGenerate(special)
				const [, xml2] = parseAndGenerate(explicit)

				// Should generate same number of intervals
				const intervals1 = countIntervals(xml1)
				const intervals2 = countIntervals(xml2)
				expect(intervals1).toBe(intervals2)
			}
		})
	})
})

describe('Seconds field', () => {
	it('handles valid cron strings', () => {
		const validCronStrings = [
			'@secondly',
			'* * * * * *',
			'5 * * * *',
			'0 * * * * *',
			'*/10 * * * * *',
		]

		const results = new Map<string, LaunchdPlistFragment>()

		for (const cronString of validCronStrings) {
			const [entry] = parseAndGenerate(cronString)
			results.set(cronString, entry)
		}

		expect(results).toMatchInlineSnapshot(`
			Map {
			  "@secondly" => {
			    "StartInterval": 1,
			  },
			  "* * * * * *" => {
			    "StartInterval": 1,
			  },
			  "5 * * * *" => {
			    "StartCalendarInterval": [
			      {
			        "Minute": 5,
			      },
			    ],
			  },
			  "0 * * * * *" => {
			    "StartCalendarInterval": [
			      {
			        "Minute": 0,
			      },
			      {
			        "Minute": 1,
			      },
			      {
			        "Minute": 2,
			      },
			      {
			        "Minute": 3,
			      },
			      {
			        "Minute": 4,
			      },
			      {
			        "Minute": 5,
			      },
			      {
			        "Minute": 6,
			      },
			      {
			        "Minute": 7,
			      },
			      {
			        "Minute": 8,
			      },
			      {
			        "Minute": 9,
			      },
			      {
			        "Minute": 10,
			      },
			      {
			        "Minute": 11,
			      },
			      {
			        "Minute": 12,
			      },
			      {
			        "Minute": 13,
			      },
			      {
			        "Minute": 14,
			      },
			      {
			        "Minute": 15,
			      },
			      {
			        "Minute": 16,
			      },
			      {
			        "Minute": 17,
			      },
			      {
			        "Minute": 18,
			      },
			      {
			        "Minute": 19,
			      },
			      {
			        "Minute": 20,
			      },
			      {
			        "Minute": 21,
			      },
			      {
			        "Minute": 22,
			      },
			      {
			        "Minute": 23,
			      },
			      {
			        "Minute": 24,
			      },
			      {
			        "Minute": 25,
			      },
			      {
			        "Minute": 26,
			      },
			      {
			        "Minute": 27,
			      },
			      {
			        "Minute": 28,
			      },
			      {
			        "Minute": 29,
			      },
			      {
			        "Minute": 30,
			      },
			      {
			        "Minute": 31,
			      },
			      {
			        "Minute": 32,
			      },
			      {
			        "Minute": 33,
			      },
			      {
			        "Minute": 34,
			      },
			      {
			        "Minute": 35,
			      },
			      {
			        "Minute": 36,
			      },
			      {
			        "Minute": 37,
			      },
			      {
			        "Minute": 38,
			      },
			      {
			        "Minute": 39,
			      },
			      {
			        "Minute": 40,
			      },
			      {
			        "Minute": 41,
			      },
			      {
			        "Minute": 42,
			      },
			      {
			        "Minute": 43,
			      },
			      {
			        "Minute": 44,
			      },
			      {
			        "Minute": 45,
			      },
			      {
			        "Minute": 46,
			      },
			      {
			        "Minute": 47,
			      },
			      {
			        "Minute": 48,
			      },
			      {
			        "Minute": 49,
			      },
			      {
			        "Minute": 50,
			      },
			      {
			        "Minute": 51,
			      },
			      {
			        "Minute": 52,
			      },
			      {
			        "Minute": 53,
			      },
			      {
			        "Minute": 54,
			      },
			      {
			        "Minute": 55,
			      },
			      {
			        "Minute": 56,
			      },
			      {
			        "Minute": 57,
			      },
			      {
			        "Minute": 58,
			      },
			      {
			        "Minute": 59,
			      },
			    ],
			  },
			  "*/10 * * * * *" => {
			    "StartInterval": 10,
			  },
			}
		`)
	})

	it('throws helpful errors for invalid cron strings', () => {
		const validCronStrings = [
			'* 1 * * * *',
			'1 * * * * *',
			'*/100 * * * * *',
			'*/10 5 * * * *',
			'*/100 5 * * * *',
		]

		const results = new Map<string, unknown>()

		for (const cronString of validCronStrings) {
			try {
				parseAndGenerate(cronString)
			} catch (error) {
				// eslint-disable-next-line ts/no-unsafe-type-assertion
				results.set(cronString, (error as Error).message)
			}
		}

		expect(results).toMatchInlineSnapshot(`
			Map {
			  "* 1 * * * *" => "Seconds wildcard can only be used when all other fields (minute, hour, day, month, weekday) are wildcards. For sub-minute scheduling, use '* * * * * *' (every second).",
			  "1 * * * * *" => "Invalid seconds value: 1. Single second values must be 0, not 1.",
			  "*/100 * * * * *" => "Invalid seconds interval: '*/100' only produces a single value (0). Use a valid interval that produces multiple values within 0-59 seconds, or use '0 * * * * *' to run every minute.",
			  "*/10 5 * * * *" => "Seconds interval (10s) can only be used when all other fields (minute, hour, day, month, weekday) are wildcards. Use 'StartInterval' requires all other fields to be '*'.",
			}
		`)
	})
})
