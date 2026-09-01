/**
 * Emits the JSON Schema for the itson config from the zod schema, and copies
 * the config type definitions into dist so the CLI can install them to
 * `~/.itson`. Runs after tsdown via the package.json build script.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { itsonConfigSchema } from '../src/lib/config.ts'

const jsonSchema = z.toJSONSchema(itsonConfigSchema, {
	io: 'input',
	override(context) {
		// The RegExp instance branch of regexPatternSchema is only expressible in
		// JS and TS configs, present it as a regex source string in JSON
		if (context.zodSchema._zod.def.type !== 'custom') {
			return
		}

		context.jsonSchema.type = 'string'
		context.jsonSchema.format = 'regex'
	},
	target: 'draft-7',
	unrepresentable: 'any',
})

const schemaJson = {
	$id: 'https://raw.githubusercontent.com/kitschpatrol/itson/main/schema.json',
	title: 'Itson configuration',
	...jsonSchema,
}

await writeFile('schema.json', `${JSON.stringify(schemaJson, undefined, '\t')}\n`, 'utf8')
// Ship the config types without the leading repo-maintainer comment, users
// only see the doc comment onward
const configTypes = await readFile('src/assets/itson.d.ts', 'utf8')
const userFacingStart = configTypes.indexOf('/**')
if (userFacingStart === -1) {
	throw new Error('Expected src/assets/itson.d.ts to start with a doc comment')
}

await writeFile('dist/itson.d.ts', configTypes.slice(userFacingStart), 'utf8')
