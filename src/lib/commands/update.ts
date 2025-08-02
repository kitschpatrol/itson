// @case-police-ignore Api

import { Octokit } from '@octokit/rest'
import { consola } from 'consola'
import keytar from 'keytar-forked'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import semver from 'semver'
import type { ItsupConfig } from '../../lib/config.js'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import { getVersion, unzip } from '../../lib/utilities.js'

// eslint-disable-next-line ts/naming-convention
const GITHUB_PAT_ACCOUNT = 'github-pat'

async function getGitHubPat(): Promise<string | undefined> {
	let pat = await keytar.getPassword(KEYCHAIN_SERVICE, GITHUB_PAT_ACCOUNT)

	if (!pat) {
		consola.start('GitHub Personal Access Token not found')

		const newPat = await consola.prompt(
			'Please enter your GitHub Personal Access Token (PAT) with `repo` scope:',
			{
				// Waiting for this to merge: https://github.com/unjs/consola/pull/366
				type: 'text',
				validate(value: string) {
					if (!value) {
						return 'A token is required.'
					}
					if (!value.startsWith('github_pat_')) {
						return 'Please enter a valid GitHub Personal Access Token.'
					}
				},
			},
		)

		if (typeof newPat !== 'string' || newPat.length === 0) {
			consola.info('Operation cancelled.')
			return
		}

		pat = newPat

		await keytar.setPassword(KEYCHAIN_SERVICE, GITHUB_PAT_ACCOUNT, pat)
		consola.success('GitHub PAT saved securely in your keychain.')
	}

	return pat
}

type ReleaseArtifact = {
	browserDownloadUrl: string
	name: string
	url: string
}

type GitHubRelease = {
	artifacts: ReleaseArtifact[]
	version: string
}

/**
 * Get the latest release info from a GitHub repository
 * @public
 */
export async function getLatestRelease(
	owner: string,
	repo: string,
): Promise<GitHubRelease | undefined> {
	const pat = await getGitHubPat()
	if (!pat) {
		return
	}

	const octokit = new Octokit({
		auth: pat,
		request: {
			timeout: 5000,
		},
		retry: {
			doNotRetry: [429],
			retries: 5,
		},
	})

	try {
		const { data: latestRelease } = await octokit.repos.getLatestRelease({
			owner,
			repo,
		})

		return {
			artifacts: latestRelease.assets.map((asset) => ({
				browserDownloadUrl: asset.browser_download_url,
				name: asset.name,
				url: asset.url,
			})),
			version: latestRelease.tag_name.replace(/^v/, ''),
		}
	} catch (error) {
		consola.error(
			`Error fetching latest release for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

async function downloadReleaseAsset(
	asset: ReleaseArtifact,
	pat: string,
): Promise<string | undefined> {
	try {
		const response = await fetch(asset.url, {
			headers: {
				// eslint-disable-next-line ts/naming-convention
				Accept: 'application/octet-stream',
				// eslint-disable-next-line ts/naming-convention
				Authorization: `Bearer ${pat}`,
				'X-GitHub-Api-Version': '2022-11-28',
			},
		})

		if (!response.ok || !response.body) {
			consola.error(`Error downloading asset: ${response.statusText}`)
			return
		}

		const temporaryDirectory = join(tmpdir(), 'itsup')
		await mkdir(temporaryDirectory, { recursive: true })
		const filePath = join(temporaryDirectory, asset.name)

		// @ts-expect-error - Readable.fromWeb is experimental
		// eslint-disable-next-line node/no-unsupported-features/node-builtins
		await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath))

		const fileStats = await stat(filePath)
		consola.success(
			`Downloaded ${asset.name} (${(fileStats.size / 1024).toFixed(2)} KB) to ${filePath}`,
		)

		if (asset.name.endsWith('.zip')) {
			return await unzip(filePath)
		}

		return filePath
	} catch (error) {
		consola.error(
			`Error downloading asset: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

/**
 * Update an application from a GitHub release
 * @public
 */
export async function updateApplicationFromGitHubRelease(
	owner: string,
	repo: string,
	destination: string,
	artifactPattern: RegExp,
): Promise<Array<string | undefined>> {
	const downloadedPaths: Array<string | undefined> = []

	const localVersion = await getVersion(destination)
	const release = await getLatestRelease(owner, repo)

	if (!release) {
		return downloadedPaths
	}

	if (localVersion && !semver.gt(release.version, localVersion)) {
		consola.info('Application is already up to date.')
		return downloadedPaths
	}

	const filteredArtifacts = release.artifacts.filter((artifact) =>
		artifactPattern.test(artifact.name),
	)

	if (filteredArtifacts.length === 0) {
		consola.warn('No matching release assets found.')
		return downloadedPaths
	}

	consola.info('Latest release artifacts:')
	consola.info(filteredArtifacts)

	const pat = await getGitHubPat()
	if (pat) {
		for (const artifact of filteredArtifacts) {
			let downloadedPath = await downloadReleaseAsset(artifact, pat)
			if (downloadedPath && destination) {
				const destinationPath = destination
				await rm(destinationPath, { force: true, recursive: true })
				await rename(downloadedPath, destinationPath)
				downloadedPath = destinationPath
				consola.success(`Moved ${basename(downloadedPath)} to ${destination}`)
			}
			downloadedPaths.push(downloadedPath)
		}
	}
	return downloadedPaths
}

/**
 * Update all applications in the config
 * @public
 */
export async function updateAllApplications(config: ItsupConfig) {
	for (const application of config.applications) {
		if (application.update !== undefined) {
			const downloadedPaths = await updateApplicationFromGitHubRelease(
				application.update.owner,
				application.update.repo,
				application.update.destination,
				application.update.artifactPattern,
			)

			for (const downloadedPath of downloadedPaths) {
				if (downloadedPath) {
					const version = await getVersion(downloadedPath)
					// eslint-disable-next-line max-depth
					if (version) {
						consola.success(`Version of ${basename(downloadedPath)}: ${version}`)
					}
				} else {
					consola.error(`No downloaded path for ${application.name}`)
				}
			}
		}
	}
}
