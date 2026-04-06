import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Tests for log-uploader logic.
 *
 * Since S3FolderSync methods are private, we test the underlying logic (ignore
 * patterns, remote key generation, file hashing) directly using the same
 * algorithms the class uses.
 */

const DEFAULT_IGNORE_PATTERNS = [
	'.DS_Store',
	'**/.DS_Store',
	'Thumbs.db',
	'**/*.tmp',
	'**/*.temp',
	'**/.env*',
]

const TRAILING_SLASH_REGEX = /\/$/

const APP_LOG_REGEX = /app\.log$/

/**
 * Mirrors S3FolderSync.shouldIgnoreFile logic
 */
function shouldIgnoreFile(filePath: string, localPath: string, ignorePatterns: string[]): boolean {
	const fileName = basename(filePath)
	const relativePath = relative(localPath, filePath)

	return ignorePatterns.some(
		(pattern) =>
			minimatch(fileName, pattern) ||
			minimatch(relativePath, pattern) ||
			minimatch(filePath, pattern),
	)
}

/**
 * Mirrors S3FolderSync.getRemoteKey logic
 */
function getRemoteKey(localFilePath: string, localPath: string, remotePath?: string): string {
	const relativePath = relative(localPath, localFilePath)
	const remoteKey = relativePath.split(sep).join('/')

	return remotePath ? `${remotePath.replace(TRAILING_SLASH_REGEX, '')}/${remoteKey}` : remoteKey
}

describe('Ignore Patterns', () => {
	const localPath = '/home/user/logs'

	it('should ignore .DS_Store files', () => {
		expect(shouldIgnoreFile('/home/user/logs/.DS_Store', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			true,
		)
	})

	it('should ignore nested .DS_Store files', () => {
		expect(
			shouldIgnoreFile('/home/user/logs/subdir/.DS_Store', localPath, DEFAULT_IGNORE_PATTERNS),
		).toBe(true)
	})

	it('should ignore Thumbs.db', () => {
		expect(shouldIgnoreFile('/home/user/logs/Thumbs.db', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			true,
		)
	})

	it('should ignore .tmp files', () => {
		expect(shouldIgnoreFile('/home/user/logs/data.tmp', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			true,
		)
	})

	it('should ignore .temp files', () => {
		expect(shouldIgnoreFile('/home/user/logs/cache.temp', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			true,
		)
	})

	it('should ignore .env files', () => {
		expect(shouldIgnoreFile('/home/user/logs/.env', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(true)
		expect(shouldIgnoreFile('/home/user/logs/.env.local', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			true,
		)
		expect(
			shouldIgnoreFile('/home/user/logs/.env.production', localPath, DEFAULT_IGNORE_PATTERNS),
		).toBe(true)
	})

	it('should not ignore regular log files', () => {
		expect(shouldIgnoreFile('/home/user/logs/app.log', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			false,
		)
	})

	it('should not ignore regular text files', () => {
		expect(shouldIgnoreFile('/home/user/logs/data.txt', localPath, DEFAULT_IGNORE_PATTERNS)).toBe(
			false,
		)
	})

	it('should respect custom ignore patterns', () => {
		const customPatterns = [...DEFAULT_IGNORE_PATTERNS, '**/*.log.gz']

		expect(shouldIgnoreFile('/home/user/logs/old.log.gz', localPath, customPatterns)).toBe(true)
		expect(shouldIgnoreFile('/home/user/logs/current.log', localPath, customPatterns)).toBe(false)
	})

	it('should handle nested directory paths', () => {
		expect(
			shouldIgnoreFile('/home/user/logs/2024/01/data.tmp', localPath, DEFAULT_IGNORE_PATTERNS),
		).toBe(true)
	})
})

describe('Remote Key Generation', () => {
	it('should generate key relative to local path', () => {
		const key = getRemoteKey('/home/user/logs/app.log', '/home/user/logs')
		expect(key).toBe('app.log')
	})

	it('should handle nested paths', () => {
		const key = getRemoteKey('/home/user/logs/2024/01/app.log', '/home/user/logs')
		expect(key).toBe('2024/01/app.log')
	})

	it('should prepend remote path when provided', () => {
		const key = getRemoteKey('/home/user/logs/app.log', '/home/user/logs', 'exhibit-1/logs')
		expect(key).toBe('exhibit-1/logs/app.log')
	})

	it('should strip trailing slash from remote path', () => {
		const key = getRemoteKey('/home/user/logs/app.log', '/home/user/logs', 'exhibit-1/logs/')
		expect(key).toBe('exhibit-1/logs/app.log')
	})

	it('should handle remote path without trailing slash', () => {
		const key = getRemoteKey('/home/user/logs/subdir/app.log', '/home/user/logs', 'remote/prefix')
		expect(key).toBe('remote/prefix/subdir/app.log')
	})

	it('should handle no remote path', () => {
		const key = getRemoteKey('/home/user/logs/subdir/file.txt', '/home/user/logs')
		expect(key).toBe('subdir/file.txt')
	})
})

describe('File Hashing', () => {
	let testDirectory: string

	beforeEach(async () => {
		testDirectory = join(
			tmpdir(),
			`itson-hash-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		)
		await mkdir(testDirectory, { recursive: true })
	})

	it('should produce consistent MD5 hashes', async () => {
		const filePath = join(testDirectory, 'test.txt')
		await writeFile(filePath, 'hello world', 'utf8')

		const content = readFileSync(filePath)
		const hash = createHash('md5').update(content).digest('hex')

		// Known MD5 of "hello world"
		expect(hash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
	})

	it('should produce different hashes for different content', async () => {
		const file1 = join(testDirectory, 'file1.txt')
		const file2 = join(testDirectory, 'file2.txt')
		await writeFile(file1, 'content A', 'utf8')
		await writeFile(file2, 'content B', 'utf8')

		const hash1 = createHash('md5').update(readFileSync(file1)).digest('hex')
		const hash2 = createHash('md5').update(readFileSync(file2)).digest('hex')

		expect(hash1).not.toBe(hash2)
	})

	it('should produce same hash for identical content', async () => {
		const file1 = join(testDirectory, 'copy1.txt')
		const file2 = join(testDirectory, 'copy2.txt')
		await writeFile(file1, 'identical content', 'utf8')
		await writeFile(file2, 'identical content', 'utf8')

		const hash1 = createHash('md5').update(readFileSync(file1)).digest('hex')
		const hash2 = createHash('md5').update(readFileSync(file2)).digest('hex')

		expect(hash1).toBe(hash2)
	})
})

describe('File Discovery', () => {
	let testDirectory: string

	beforeEach(async () => {
		testDirectory = join(
			tmpdir(),
			`itson-discover-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		)
		await mkdir(testDirectory, { recursive: true })
	})

	it('should find files in nested directories', async () => {
		const subDirectory = join(testDirectory, 'sub', 'deep')
		await mkdir(subDirectory, { recursive: true })

		await writeFile(join(testDirectory, 'root.log'), 'root', 'utf8')
		await writeFile(join(testDirectory, 'sub', 'mid.log'), 'mid', 'utf8')
		await writeFile(join(subDirectory, 'deep.log'), 'deep', 'utf8')

		// Use readdir recursive to verify structure
		const files: string[] = []
		const scanDirectory = async (currentPath: string) => {
			const items = await readdir(currentPath, { withFileTypes: true })
			for (const item of items) {
				const fullPath = join(currentPath, item.name)
				if (item.isDirectory()) {
					await scanDirectory(fullPath)
				} else if (item.isFile()) {
					files.push(fullPath)
				}
			}
		}

		await scanDirectory(testDirectory)

		expect(files).toHaveLength(3)
		expect(files.some((f) => f.endsWith('root.log'))).toBe(true)
		expect(files.some((f) => f.endsWith('mid.log'))).toBe(true)
		expect(files.some((f) => f.endsWith('deep.log'))).toBe(true)
	})

	it('should filter out ignored files during discovery', async () => {
		await writeFile(join(testDirectory, 'app.log'), 'log data', 'utf8')
		await writeFile(join(testDirectory, '.DS_Store'), '', 'utf8')
		await writeFile(join(testDirectory, 'data.tmp'), 'temp', 'utf8')
		await writeFile(join(testDirectory, '.env'), 'SECRET=x', 'utf8')

		const items = await readdir(testDirectory, { withFileTypes: true })
		const files = items
			.filter((item) => item.isFile())
			.map((item) => join(testDirectory, item.name))
			.filter((filePath) => !shouldIgnoreFile(filePath, testDirectory, DEFAULT_IGNORE_PATTERNS))

		expect(files).toHaveLength(1)
		expect(files[0]).toMatch(APP_LOG_REGEX)
	})
})
