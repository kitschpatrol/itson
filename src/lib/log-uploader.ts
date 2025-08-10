/* eslint-disable ts/member-ordering */
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { consola } from 'consola'
import keytar from 'keytar-forked'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import type { ItsonLogUploadStrategyS3 } from './config'
import { KEYCHAIN_SERVICE } from '../lib/constants.js' // Adjust path as needed

/**
 * Glob patterns for files to ignore during log upload
 */
// eslint-disable-next-line ts/naming-convention
const IGNORE_PATTERNS = [
	'.DS_Store',
	'**/.DS_Store',
	'Thumbs.db',
	'**/*.tmp',
	'**/*.temp',
	'**/.env*',
]

export class S3FolderSync {
	private static get keychainAccessKeyAccount() {
		return 's3-access-key'
	}

	private static get keychainSecretKeyAccount() {
		return 's3-secret-key'
	}

	private s3Client: S3Client | undefined = undefined

	constructor(
		private readonly config: ItsonLogUploadStrategyS3,
		private readonly ignorePatterns: string[] = IGNORE_PATTERNS,
	) {}

	/**
	 * Clear stored credentials (useful for switching accounts or troubleshooting)
	 */
	static async clearCredentials(): Promise<void> {
		await keytar.deletePassword(KEYCHAIN_SERVICE, S3FolderSync.keychainAccessKeyAccount)
		await keytar.deletePassword(KEYCHAIN_SERVICE, S3FolderSync.keychainSecretKeyAccount)

		consola.success('S3 credentials cleared from keychain.')
	}

	/**
	 * Get S3 access key ID from keychain or prompt for it
	 */
	private static async getAccessKeyId(): Promise<string | undefined> {
		let accessKeyId = await keytar.getPassword(
			KEYCHAIN_SERVICE,
			S3FolderSync.keychainAccessKeyAccount,
		)

		if (!accessKeyId) {
			consola.start('S3 Access Key ID not found')

			const newAccessKeyId = await consola.prompt('Please enter your S3 Access Key ID:', {
				type: 'text',
				validate(value: string) {
					if (!value) {
						return 'An access key ID is required.'
					}
					if (value.length < 10) {
						return 'Please enter a valid S3 Access Key ID.'
					}
				},
			})

			if (typeof newAccessKeyId !== 'string' || newAccessKeyId.length === 0) {
				consola.info('Operation cancelled.')
				return
			}

			accessKeyId = newAccessKeyId
			await keytar.setPassword(KEYCHAIN_SERVICE, S3FolderSync.keychainAccessKeyAccount, accessKeyId)
			consola.success('S3 Access Key ID saved securely in your keychain.')
		}

		return accessKeyId
	}

	/**
	 * Get S3 secret access key from keychain or prompt for it
	 */
	private static async getSecretAccessKey(): Promise<string | undefined> {
		let secretAccessKey = await keytar.getPassword(
			KEYCHAIN_SERVICE,
			S3FolderSync.keychainSecretKeyAccount,
		)

		if (!secretAccessKey) {
			consola.start('S3 Secret Access Key not found')

			const newSecretAccessKey = await consola.prompt('Please enter your S3 Secret Access Key:', {
				type: 'text',
				validate(value: string) {
					if (!value) {
						return 'A secret access key is required.'
					}
					if (value.length < 20) {
						return 'Please enter a valid S3 Secret Access Key.'
					}
				},
			})

			if (typeof newSecretAccessKey !== 'string' || newSecretAccessKey.length === 0) {
				consola.info('Operation cancelled.')
				return
			}

			secretAccessKey = newSecretAccessKey
			await keytar.setPassword(
				KEYCHAIN_SERVICE,
				S3FolderSync.keychainSecretKeyAccount,
				secretAccessKey,
			)
			consola.success('S3 Secret Access Key saved securely in your keychain.')
		}

		return secretAccessKey
	}

	/**
	 * Perform the sync operation
	 */
	async sync(): Promise<void> {
		consola.start(
			`Starting sync from ${this.config.localPath} to S3 bucket ${this.config.bucketName}`,
		)

		try {
			// Initialize client with credentials
			if (!(await this.initializeClient())) {
				consola.error('Failed to initialize S3 client - credentials not available')
				return
			}

			// Get all local files
			consola.info('Scanning local files...')
			const localFiles = await this.getLocalFiles(this.config.localPath)
			consola.info(`Found ${localFiles.length} local files`)

			// Get all remote files
			consola.info('Fetching remote file list...')
			const remoteFiles = await this.getRemoteFiles()
			consola.info(`Found ${remoteFiles.size} remote files`)

			let uploadedCount = 0
			let skippedCount = 0

			// Process each local file
			for (const localFilePath of localFiles) {
				const remoteKey = this.getRemoteKey(localFilePath)
				const remoteFile = remoteFiles.get(remoteKey)

				if (await this.shouldUpload(localFilePath, remoteFile)) {
					await this.uploadFile(localFilePath)
					uploadedCount++
				} else {
					consola.info(`Skipping (up to date): ${localFilePath}`)
					skippedCount++
				}
			}

			consola.success('Sync completed:')
			consola.info(`- Uploaded: ${uploadedCount} files`)
			consola.info(`- Skipped: ${skippedCount} files`)
			consola.info(`- Remote files preserved: ${remoteFiles.size - uploadedCount} files`)
		} catch (error) {
			consola.error('Sync failed:', error)
			throw error
		}
	}

	/**
	 * Calculate MD5 hash of a file (to compare with S3 ETag)
	 */
	private async calculateFileHash(filePath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const hash = createHash('md5')
			const stream = createReadStream(filePath)

			stream.on('data', (data) => hash.update(data))
			stream.on('end', () => {
				resolve(hash.digest('hex'))
			})
			stream.on('error', reject)
		})
	}

	/**
	 * Recursively get all files in a directory
	 */
	private async getLocalFiles(directoryPath: string): Promise<string[]> {
		const files: string[] = []

		const scanDirectory = async (currentPath: string) => {
			const items = await readdir(currentPath, { withFileTypes: true })

			for (const item of items) {
				const fullPath = join(currentPath, item.name)

				if (item.isDirectory()) {
					await scanDirectory(fullPath)
				} else if (item.isFile() && !this.shouldIgnoreFile(fullPath)) {
					files.push(fullPath)
				}
			}
		}

		await scanDirectory(directoryPath)
		return files
	}

	/**
	 * Get all remote files with their metadata
	 */
	private async getRemoteFiles(): Promise<Map<string, { etag: string; lastModified: Date }>> {
		if (!this.s3Client) {
			throw new Error('S3 client not initialized')
		}

		const remoteFiles = new Map<string, { etag: string; lastModified: Date }>()
		let continuationToken: string | undefined

		do {
			const command = new ListObjectsV2Command({
				// eslint-disable-next-line ts/naming-convention
				Bucket: this.config.bucketName,
				// eslint-disable-next-line ts/naming-convention
				ContinuationToken: continuationToken,
				// eslint-disable-next-line ts/naming-convention
				Prefix: this.config.remotePath ?? '',
			})

			const response = await this.s3Client.send(command)

			if (response.Contents) {
				for (const object of response.Contents) {
					if (object.Key && object.LastModified && object.ETag) {
						remoteFiles.set(object.Key, {
							etag: object.ETag.replaceAll('"', ''), // Remove quotes from ETag
							lastModified: object.LastModified,
						})
					}
				}
			}

			continuationToken = response.NextContinuationToken
		} while (continuationToken)

		return remoteFiles
	}

	/**
	 * Convert local file path to remote key
	 */
	private getRemoteKey(localFilePath: string): string {
		const relativePath = relative(this.config.localPath, localFilePath)
		const remoteKey = relativePath.split(sep).join('/') // Ensure forward slashes

		return this.config.remotePath
			? `${this.config.remotePath.replace(/\/$/, '')}/${remoteKey}`
			: remoteKey
	}

	/**
	 * Initialize S3 client with credentials from keychain
	 */
	private async initializeClient(): Promise<boolean> {
		if (this.s3Client) {
			return true
		}

		const accessKeyId = await S3FolderSync.getAccessKeyId()
		const secretAccessKey = await S3FolderSync.getSecretAccessKey()

		if (!accessKeyId || !secretAccessKey) {
			return false
		}

		this.s3Client = new S3Client({
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
			endpoint: this.config.endpoint,
			region: 'auto',
		})

		return true
	}

	/**
	 * Check if a file should be ignored based on glob patterns
	 */
	private shouldIgnoreFile(filePath: string): boolean {
		const fileName = basename(filePath)
		const relativePath = relative(this.config.localPath, filePath)

		return this.ignorePatterns.some(
			(pattern) =>
				minimatch(fileName, pattern) ||
				minimatch(relativePath, pattern) ||
				minimatch(filePath, pattern),
		)
	}

	/**
	 * Check if local file is newer or different from remote file
	 */
	private async shouldUpload(
		localFilePath: string,
		remoteFile?: { etag: string; lastModified: Date },
	): Promise<boolean> {
		if (!remoteFile) {
			return true // File doesn't exist remotely, upload it
		}

		const localStats = statSync(localFilePath)
		const localModifiedTime = localStats.mtime

		// If local file is newer, upload it
		if (localModifiedTime > remoteFile.lastModified) {
			return true
		}

		// If modification times are the same, check if content is different
		if (localModifiedTime.getTime() === remoteFile.lastModified.getTime()) {
			const localHash = await this.calculateFileHash(localFilePath)
			return localHash !== remoteFile.etag
		}

		return false // Remote file is newer or same, don't upload
	}

	/**
	 * Upload a file to S3
	 * @throws
	 */
	private async uploadFile(localFilePath: string): Promise<void> {
		if (!this.s3Client) {
			throw new Error('S3 client not initialized')
		}

		const remoteKey = this.getRemoteKey(localFilePath)

		consola.info(`Uploading: ${localFilePath} -> ${remoteKey}`)

		const command = new PutObjectCommand({
			// eslint-disable-next-line ts/naming-convention
			Body: createReadStream(localFilePath),
			// eslint-disable-next-line ts/naming-convention
			Bucket: this.config.bucketName,
			// eslint-disable-next-line ts/naming-convention
			Key: remoteKey,
		})

		await this.s3Client.send(command)
	}
}
