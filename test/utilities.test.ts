import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteFileSafe, promptForSecret, readFileSafe, redactSecret } from '../src/lib/utilities'

describe('redactSecret', () => {
	it('should replace every occurrence of the secret', () => {
		const message =
			'Command failed: uv tool install git+https://github_pat_abc@github.com/o/r (git+https://github_pat_abc@github.com/o/r)'
		const redacted = redactSecret(message, 'github_pat_abc')

		expect(redacted).not.toContain('github_pat_abc')
		expect(redacted).toBe(
			'Command failed: uv tool install git+https://***@github.com/o/r (git+https://***@github.com/o/r)',
		)
	})

	it('should leave text without the secret unchanged', () => {
		expect(redactSecret('nothing to see', 'github_pat_abc')).toBe('nothing to see')
	})

	it('should not blank out everything for an empty secret', () => {
		expect(redactSecret('keep me', '')).toBe('keep me')
	})
})

describe('promptForSecret', () => {
	it('should return undefined instead of prompting when stdin is not a TTY', async () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
		Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })

		try {
			const result = await promptForSecret('Enter a secret:', () => 'invalid')
			expect(result).toBeUndefined()
		} finally {
			if (originalDescriptor === undefined) {
				delete (process.stdin as { isTTY?: boolean }).isTTY
			} else {
				Object.defineProperty(process.stdin, 'isTTY', originalDescriptor)
			}
		}
	})
})

describe('readFileSafe', () => {
	let testDirectory: string

	beforeEach(async () => {
		testDirectory = join(
			tmpdir(),
			`itson-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		)
		await mkdir(testDirectory, { recursive: true })
	})

	it('should read an existing file', async () => {
		const filePath = join(testDirectory, 'test.txt')
		await writeFile(filePath, 'hello world', 'utf8')

		const result = await readFileSafe(filePath)
		expect(result).toBe('hello world')
	})

	it('should return undefined for a non-existent file', async () => {
		const result = await readFileSafe(join(testDirectory, 'does-not-exist.txt'))
		expect(result).toBeUndefined()
	})

	it('should read empty files', async () => {
		const filePath = join(testDirectory, 'empty.txt')
		await writeFile(filePath, '', 'utf8')

		const result = await readFileSafe(filePath)
		expect(result).toBe('')
	})

	it('should read files with unicode content', async () => {
		const filePath = join(testDirectory, 'unicode.txt')
		const content = 'Hello 世界 🌍 café'
		await writeFile(filePath, content, 'utf8')

		const result = await readFileSafe(filePath)
		expect(result).toBe(content)
	})

	it('should read files with newlines', async () => {
		const filePath = join(testDirectory, 'multiline.txt')
		const content = 'line1\nline2\nline3'
		await writeFile(filePath, content, 'utf8')

		const result = await readFileSafe(filePath)
		expect(result).toBe(content)
	})
})

describe('deleteFileSafe', () => {
	let testDirectory: string

	beforeEach(async () => {
		testDirectory = join(
			tmpdir(),
			`itson-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		)
		await mkdir(testDirectory, { recursive: true })
	})

	it('should delete an existing file and return true', async () => {
		const filePath = join(testDirectory, 'to-delete.txt')
		await writeFile(filePath, 'delete me', 'utf8')

		const result = await deleteFileSafe(filePath)
		expect(result).toBe(true)

		// Verify file is gone
		const readResult = await readFileSafe(filePath)
		expect(readResult).toBeUndefined()
	})

	it('should return false for a non-existent file', async () => {
		const result = await deleteFileSafe(join(testDirectory, 'does-not-exist.txt'))
		expect(result).toBe(false)
	})

	it('should handle deleting the same file twice', async () => {
		const filePath = join(testDirectory, 'double-delete.txt')
		await writeFile(filePath, 'content', 'utf8')

		const first = await deleteFileSafe(filePath)
		expect(first).toBe(true)

		const second = await deleteFileSafe(filePath)
		expect(second).toBe(false)
	})
})
