import { Octokit } from '@octokit/rest'
import keytar from 'keytar-forked'
import * as s from '@clack/prompts'
import { intro, outro } from '@clack/prompts'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import semver from 'semver'
import { getVersion, unzip } from './utilities.js'

const GITHUB_PAT_SERVICE = 'itson-cli'
const GITHUB_PAT_ACCOUNT = 'github-pat'

async function getGitHubPat(): Promise<string | undefined> {
	let pat = await keytar.getPassword(GITHUB_PAT_SERVICE, GITHUB_PAT_ACCOUNT)

	if (!pat) {
		s.intro('GitHub Personal Access Token not found')

		const newPat = await s.password({
			message: 'Please enter your GitHub Personal Access Token (PAT) with `repo` scope:',
			validate: (value) => {
				if (!value) {
					return 'A token is required.'
				}
				if (!value.startsWith('github_pat_')) {
					return 'Please enter a valid GitHub Personal Access Token.'
				}
			},
		})

		if (s.isCancel(newPat)) {
			s.cancel('Operation cancelled.')
			return
		}

		pat = newPat

		await keytar.setPassword(GITHUB_PAT_SERVICE, GITHUB_PAT_ACCOUNT, pat)
		s.outro('GitHub PAT saved securely in your keychain.')
	}

	return pat
}

interface ReleaseArtifact {
	name: string
	url: string
	browser_download_url: string
}

interface GitHubRelease {
	version: string
	artifacts: ReleaseArtifact[]
}

export async function getLatestRelease(
	owner: string,
	repo: string,
): Promise<GitHubRelease | undefined> {
	const pat = await getGitHubPat()
	if (!pat) {
		return
	}

	const octokit = new Octokit({ auth: pat })

	try {
		const { data: latestRelease } = await octokit.repos.getLatestRelease({
			owner,
			repo,
		})

		return {
			version: latestRelease.tag_name.replace(/^v/, ''),
			artifacts: latestRelease.assets.map((asset) => ({
				name: asset.name,
				url: asset.url,
				browser_download_url: asset.browser_download_url,
			})),
		}
	} catch (error) {
		s.log.error(
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
				Accept: 'application/octet-stream',
				Authorization: `Bearer ${pat}`,
				'X-GitHub-Api-Version': '2022-11-28',
			},
		})

		if (!response.ok || !response.body) {
			s.log.error(`Error downloading asset: ${response.statusText}`)
			return
		}

		const tempDir = join(tmpdir(), 'itson')
		await mkdir(tempDir, { recursive: true })
		const filePath = join(tempDir, asset.name)

		await pipeline(
			Readable.fromWeb(response.body as ReadableStream<any>),
			createWriteStream(filePath),
		)

		const fileStats = await stat(filePath)
		s.log.success(
			`Downloaded ${asset.name} (${(fileStats.size / 1024).toFixed(2)} KB) to ${filePath}`,
		)

		if (asset.name.endsWith('.zip')) {
			return await unzip(filePath)
		}

		return filePath
	} catch (error) {
		s.log.error(
			`Error downloading asset: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

export async function downloadLatestReleaseArtifact(
	owner: string,
	repo: string,
	namePattern: RegExp,
	destination: string,
): Promise<(string | undefined)[]> {
	const downloadedPaths: (string | undefined)[] = []

	const localVersion = await getVersion(destination)
	const release = await getLatestRelease(owner, repo)

	if (!release) {
		return downloadedPaths
	}

	if (localVersion && !semver.gt(release.version, localVersion)) {
		s.log.info('Application is already up to date.')
		return downloadedPaths
	}

	const filteredArtifacts = release.artifacts.filter((artifact) => namePattern.test(artifact.name))

	if (filteredArtifacts.length === 0) {
		s.log.warn('No matching release assets found.')
		return downloadedPaths
	}

	outro('Latest release artifacts:')
	console.log(filteredArtifacts)

	const pat = await getGitHubPat()
	if (pat) {
		for (const artifact of filteredArtifacts) {
			let downloadedPath = await downloadReleaseAsset(artifact, pat)
			if (downloadedPath && destination) {
				const destinationPath = destination
				await rm(destinationPath, { recursive: true, force: true })
				await rename(downloadedPath, destinationPath)
				downloadedPath = destinationPath
				s.log.success(`Moved ${basename(downloadedPath)} to ${destination}`)
			}
			downloadedPaths.push(downloadedPath)
		}
	}
	return downloadedPaths
}

// Example usage:
async function main() {
	intro('Fetching and downloading latest release artifacts...')
	const downloadedPaths = await downloadLatestReleaseArtifact(
		'kitschpatrol',
		'allwork',
		/^AllWork.+\.zip$/,
		'/Applications/AllWork.app',
	)

	if (downloadedPaths.length > 0) {
		outro('Downloaded content paths:')
		console.log(downloadedPaths)

		for (const downloadedPath of downloadedPaths) {
			if (downloadedPath) {
				const version = await getVersion(downloadedPath)
				if (version) {
					outro(`Version of ${basename(downloadedPath)}: ${version}`)
				}
			}
		}
	}
}

main().catch(console.error)
