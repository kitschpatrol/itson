/* eslint-disable ts/naming-convention */
/* eslint-disable complexity */

/**
 * This could be its own package.
 * Inspired by https://github.com/randomn4me/crontab-to-launchd, but leans
 * on existing libraries for cron parsing and plist manipulation.
 */

import type plist from 'plist'
import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'

/**
 * Convert a cron string to a functionally equivalent launchd plist fragment
 *
 * Seconds values don't map cleanly from cron to launchd, so we treat them
 * as a special case and do our best to convert them to a launchd compatible format.
 * Many input combinations cannot be represented, however, so it's advised to
 * avoid using seconds values in cron strings if possible.
 *
 * Unlike https://github.com/randomn4me/crontab-to-launchd, we don't treat
 * repeating minutes like `*\/5 * * * *` as a special case of `StartInterval`
 * instead of `StartCalendarInterval` because repeating minutes should still
 * match their clock values modulo the interval. We only use `StartInterval`
 * as a compromise when needed because `StartCalendarInterval` only has minute resolution.
 *
 * Launchd doesn't really support ranges like cron, we work around this by
 * generating all permutations required to represent the given range. This
 * creates a risk of combinatorial explosion. This function will throw if a high
 * threshold is exceeded, but the true boundaries of launchd are unknown and
 * apparently undocumented.
 * @throws {Error} if the cron string can't be parsed or is unsupported by launchd
 * @returns the launchd plist fragment
 */
export function cronToPlistFragment(cronString: string): plist.PlistValue {
	// Special case, not supported by cron-parser, but supported by launchd
	if (cronString.trim() === '@reboot') {
		return {
			RunAtLoad: true,
		}
	}

	// Normal path
	const parsedCronExpression = CronExpressionParser.parse(cronString)
	const { second: secondField, ...serializedFields } = parsedCronExpression.fields.serialize()

	// Check if all non-second fields are wildcards
	const allOtherFieldsWild = Object.entries(serializedFields).every(([_, value]) => value.wildcard)

	// Validate seconds field usage
	// Seconds are only supported when all other fields are wildcards
	if (!secondField.wildcard) {
		// Ensure all values are numbers
		if (!secondField.values.every((value) => typeof value === 'number')) {
			throw new Error('Seconds values must be numbers')
		}

		const secondValues = secondField.values

		// Case 1: Single non-zero second value (e.g., '1 * * * * *')
		if (secondValues.length === 1 && secondValues[0] !== 0) {
			const error = allOtherFieldsWild
				? new Error(
						`Invalid seconds value: ${secondValues[0]}. Single second values must be 0, not ${secondValues[0]}.`,
					)
				: new Error(
						`Invalid seconds value: ${secondValues[0]}. Seconds field can only be used when all other fields (minute, hour, day, month, weekday) are wildcards.`,
					)
			throw error
		}

		// Case 2: Multiple second values (interval pattern like '*/10')
		if (secondValues.length > 1) {
			const consistentSecondInterval = getConsistentSecondInterval(secondValues)

			// Check if it's a valid interval
			if (consistentSecondInterval === undefined) {
				throw new Error(
					`Invalid seconds interval. Values [${secondValues.join(', ')}] do not form a consistent interval starting at 0.`,
				)
			}

			// Valid interval, but other fields must be wildcards
			if (!allOtherFieldsWild) {
				throw new Error(
					`Seconds interval (${consistentSecondInterval}s) can only be used when all other fields (minute, hour, day, month, weekday) are wildcards. Use 'StartInterval' requires all other fields to be '*'.`,
				)
			}

			// Valid interval with all other fields wild - use StartInterval
			return {
				StartInterval: consistentSecondInterval,
			}
		}

		// Case 3: Single zero value - check if it's a degenerate interval
		// If allOtherFieldsWild=false, this is likely a 5-field cron (e.g., '5 * * * *') where seconds defaults to 0 - allow it
		// If allOtherFieldsWild=true, this is a 6-field cron (e.g., '0 * * * * *' or '*/100 * * * * *')
		if (secondValues.length === 1 && secondValues[0] === 0 && allOtherFieldsWild) {
			// Check if the raw value indicates it's a degenerate interval like */100
			// @ts-expect-error - options is protected
			const { rawValue } = parsedCronExpression.fields.second.options
			if (rawValue.includes('/')) {
				throw new Error(
					`Invalid seconds interval: '${rawValue}' only produces a single value (0). Use a valid interval that produces multiple values within 0-59 seconds, or use '0 * * * * *' to run every minute.`,
				)
			}
		}
	}

	// Case 4: Second field is wildcard
	if (secondField.wildcard && !allOtherFieldsWild) {
		throw new Error(
			`Seconds wildcard can only be used when all other fields (minute, hour, day, month, weekday) are wildcards. For sub-minute scheduling, use '* * * * * *' (every second).`,
		)
	}

	// Ignore wildcards / zero values
	let fieldsToCreate = Object.fromEntries(
		Object.entries(serializedFields)
			.filter(([_, value]) => !value.wildcard)
			.map(([field, value]) => {
				// Ensure all values are numbers
				if (!value.values.every((value) => typeof value === 'number')) {
					throw new Error(`Field ${field} values must be numbers: ${value.values.join(', ')}`)
				}

				// Note special handling for dayOfWeek to deduplicate 0 and 7
				return [
					cronKeyToPlistKey(field),
					field === 'dayOfWeek' ? deduplicateWeekdays(value.values) : value.values,
				]
			}),
	)

	// Special case all wildcard fields...
	// Use second interval if it's available and valid,
	// otherwise treat this case as an every minute interval
	if (Object.keys(fieldsToCreate).length === 0) {
		if (secondField.wildcard) {
			return {
				StartInterval: 1,
			}
		}

		fieldsToCreate = {
			Minute: serializedFields.minute.values,
		}
	}

	// Multiply all the value lengths to get total permutations
	const permutations = Object.values(fieldsToCreate).reduce(
		(acc, current) => acc * current.length,
		1,
	)

	// Maximum number of entries to generate without throwing an error...
	// This is somewhat arbitrary.
	// Library can handle generating up to 2^20 on my laptop,
	// but who knows how much launchd can handle...
	// https://discussions.apple.com/thread/6432221?sortBy=rank
	if (permutations > 2 ** 16) {
		throw new Error(`Too many permutations: ${permutations}`)
	}

	// Build the permutations
	const startCalendarIntervalArray: plist.PlistValue[] = []

	for (let i = 0; i < permutations; i++) {
		const startCalendarIntervalItem: Record<string, number> = {}

		for (const [field, values] of Object.entries(fieldsToCreate)) {
			const value = values[i % values.length]
			if (typeof value !== 'number') {
				throw new TypeError(`Field ${field} is not a number: ${value}`)
			}
			startCalendarIntervalItem[field] = value
		}

		startCalendarIntervalArray.push(startCalendarIntervalItem)
	}

	if (startCalendarIntervalArray.length === 0) {
		throw new Error(`No start calendar interval items found for cron string: ${cronString}`)
	}

	return {
		StartCalendarInterval: startCalendarIntervalArray,
	}
}

/**
 * Get a human-readable description of a cron string.
 * @param cronString - The cron string to describe.
 * @returns A human-readable description of the cron string, or the original
 * string if it can't be parsed or described.
 */
export function getCronStringDescription(cronString: string): string {
	try {
		return cronstrue.toString(cronString)
	} catch {
		return cronString
	}
}

/**
 * Convert a serialized cron field key to a launchd plist key.
 * @throws {Error} if the cron key is invalid or not supported by launchd
 */
function cronKeyToPlistKey(cronKey: string): string {
	switch (cronKey) {
		case 'dayOfMonth': {
			return 'Day'
		}
		case 'dayOfWeek': {
			return 'Weekday'
		}
		case 'hour': {
			return 'Hour'
		}
		case 'month': {
			return 'Month'
		}
		case 'second': {
			throw new Error(`Second values not supported in launchd`)
		}
		case 'minute': {
			return 'Minute'
		}
		default: {
			throw new Error(`Unsupported cron key: ${cronKey}`)
		}
	}
}

/**
 * Validate and extract a consistent second interval from a list of second values, useful
 * for converting second intervals to launchd's StartInterval format.
 * @param values - The list of second values to validate and extract the interval from.
 * @returns The consistent second interval, or undefined if the values are not valid.
 */
function getConsistentSecondInterval(values: number[]): number | undefined {
	// Can't be a single value
	if (values.length < 2) {
		return undefined
	}

	const interval = values[1] - values[0]

	if (
		// Interval is consistent
		values.every((value, index) => value - values[0] === interval * index) &&
		// Values cover the full minute
		(values.at(-1) ?? 0) + interval >= 60 &&
		values[0] === 0
	) {
		return interval
	}

	return undefined
}

/**
 * Deduplicate weekday values to ensure they are within the range 0-6.
 * @param values - The list of weekday values to deduplicate.
 * @returns The deduplicated list of weekday values.
 */
function deduplicateWeekdays(values: number[]): number[] {
	const hasZero = values.includes(0)
	const hasSeven = values.includes(7)

	// If both 0 and 7 are present, keep only 0 (launchd standard)
	if (hasZero && hasSeven) {
		return values.filter((v) => v !== 7)
	}

	// If only 7 is present, convert it to 0
	if (hasSeven && !hasZero) {
		return values.map((v) => (v === 7 ? 0 : v))
	}

	return values
}
