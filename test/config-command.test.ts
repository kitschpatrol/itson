import { loadConfig } from 'c12'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ItsonConfigInput } from '../src/lib/config'
import { STARTER_CONFIG } from '../src/lib/commands/config'
import { itsonConfigSchema } from '../src/lib/config'

/**
 * Load a config file the same way the CLI does, from a directory of its own.
 */
async function loadStarterConfig(source: string): Promise<unknown> {
	const directory = join(
		tmpdir(),
		`itson-starter-config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	)
	await mkdir(directory, { recursive: true })
	await writeFile(join(directory, 'itson.config.ts'), source, 'utf8')

	const { config } = await loadConfig<ItsonConfigInput>({
		cwd: directory,
		globalRc: false,
		name: 'itson',
		rcFile: false,
	})

	return config
}

/**
 * Uncomment the example entries in the starter config, which are the only
 * comments indented two tabs or deeper.
 */
function uncommentExamples(source: string): string {
	return source.replaceAll(/^\t\t\/\/ ?/gmv, '\t\t')
}

describe('starter config', () => {
	it('should load and validate as written', async () => {
		const config = await loadStarterConfig(STARTER_CONFIG)
		const parsed = itsonConfigSchema.parse(config)

		expect(parsed.applications).toHaveLength(0)
		expect(parsed.tasks).toHaveLength(0)
		expect(parsed.runOnStartup).toBe(false)
	})

	it('should load and validate with the examples uncommented', async () => {
		const source = uncommentExamples(STARTER_CONFIG)
		expect(source).not.toBe(STARTER_CONFIG)

		const config = await loadStarterConfig(source)
		const parsed = itsonConfigSchema.parse(config)

		expect(parsed.applications).toHaveLength(1)
		expect(parsed.tasks).toHaveLength(1)

		const update = parsed.applications[0]?.update
		if (update?.type !== 'github') {
			throw new Error('Expected a github update strategy')
		}

		expect(update.artifactPattern.test('AllWork-1.0.0.zip')).toBe(true)
	})
})
