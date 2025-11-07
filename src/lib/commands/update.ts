// @case-police-ignore Api
import { text } from '@clack/prompts'
import { Octokit } from '@octokit/rest'
import { execa } from 'execa'
import findVersions from 'find-versions'
import isOnline from 'is-online'
import keytar from 'keytar-forked'
import { log } from 'lognow'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import semver from 'semver'
import type { ItsonConfig } from '../../lib/config.js'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import { getVersion, unzip } from '../../lib/utilities.js'

const GITHUB_PAT_ACCOUNT = 'github-pat'

async function getGitHubPat(): Promise<string | undefined> {
	let pat = await keytar.getPassword(KEYCHAIN_SERVICE, GITHUB_PAT_ACCOUNT)

	if (!pat) {
		log.info('GitHub Personal Access Token not found')

		const newPat = await text({
			message: 'Please enter your GitHub Personal Access Token (PAT) with `repo` scope:',
			validate(value: string) {
				if (!value) {
					return 'A token is required.'
				}
				if (!value.startsWith('github_pat_')) {
					return 'Please enter a valid GitHub Personal Access Token.'
				}
			},
		})

		if (typeof newPat !== 'string' || newPat.length === 0) {
			log.info('Operation cancelled.')
			return
		}

		pat = newPat

		await keytar.setPassword(KEYCHAIN_SERVICE, GITHUB_PAT_ACCOUNT, pat)
		log.info('GitHub PAT saved securely in your keychain.')
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
 * Get all releases from a GitHub repository
 * @public
 */
export async function getAllReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
	const pat = await getGitHubPat()
	if (!pat) {
		return []
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
		const releases = await octokit.paginate(octokit.repos.listReleases, {
			owner,
			// eslint-disable-next-line ts/naming-convention
			per_page: 100,
			repo,
		})

		return releases.map((release) => ({
			artifacts: release.assets.map((asset) => ({
				browserDownloadUrl: asset.browser_download_url,
				name: asset.name,
				url: asset.url,
			})),
			version: release.tag_name.replace(/^v/, ''),
		}))
	} catch (error) {
		log.error(
			`Error fetching releases for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
		)
		return []
	}
}

/**
 * Get the latest release info from a GitHub repository
 */
async function getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | undefined> {
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
		log.error(
			`Error fetching latest release for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

/**
 * Find the best release that satisfies a semver constraint
 * @public
 */
export async function getBestReleaseForConstraint(
	owner: string,
	repo: string,
	versionConstraint?: string,
): Promise<GitHubRelease | undefined> {
	// If no constraint provided, use latest release
	if (!versionConstraint) {
		return getLatestRelease(owner, repo)
	}

	const allReleases = await getAllReleases(owner, repo)
	if (allReleases.length === 0) {
		return undefined
	}

	// Filter releases that satisfy the constraint and sort by version (highest first)
	const satisfyingReleases = allReleases
		.filter((release) => {
			const version = semver.valid(release.version)
			return version && semver.satisfies(version, versionConstraint)
		})
		.toSorted((a, b) => semver.rcompare(a.version, b.version))

	if (satisfyingReleases.length === 0) {
		log.warn(`No releases found that satisfy version constraint: ${versionConstraint}`)
		return undefined
	}

	return satisfyingReleases[0]
}

async function getVersionFromCLI(cli: string): Promise<string | undefined> {
	try {
		const { stdout } = await execa(cli, ['--version'], { reject: false })
		return findVersions(stdout).at(0)
	} catch (error) {
		log.error(
			`Error getting version from ${cli}: ${error instanceof Error ? error.message : String(error)}`,
		)
		return undefined
	}
}

async function updateFromGitHubPythonRelease(
	owner: string,
	repo: string,
	cli: string,
	versionConstraint?: string,
): Promise<void> {
	const localVersion = await getVersionFromCLI(cli)

	// If we have a local version and an EXACT version constraint, check if it matches
	// For range constraints (^, ~, etc.), we still want aggressive updates within the range
	if (
		localVersion &&
		versionConstraint &&
		semver.valid(versionConstraint) &&
		semver.eq(localVersion, versionConstraint)
	) {
		log.info(`${cli} is already at the exact version specified: ${localVersion}.`)
		return
	}

	const release = await getBestReleaseForConstraint(owner, repo, versionConstraint)

	if (!release) {
		return
	}

	// If we have a constraint, check if the release is different from local
	// For exact versions, allow downgrades; for ranges, only upgrade
	if (localVersion && versionConstraint) {
		// Check if this is an exact version using semver API
		const isExactVersion = semver.valid(versionConstraint) !== null
		if (!isExactVersion && !semver.gt(release.version, localVersion)) {
			// For range constraints, only upgrade
			log.info(
				`${cli} is already up to date with version ${localVersion} (best available: ${release.version}).`,
			)
			return
		}
		// For exact versions, we already checked equality above, so if we're here, proceed with install
	}

	// If no constraint but local version is same or newer than release, skip
	if (localVersion && !versionConstraint && !semver.gt(release.version, localVersion)) {
		log.info(`${cli} is already up to date with version ${localVersion}.`)
		return
	}

	const isDowngrade = localVersion && semver.lt(release.version, localVersion)
	const action = isDowngrade ? 'Downgrading to' : 'Installing'
	log.info(
		`${action} release version: ${release.version}${versionConstraint ? ` (satisfies ${versionConstraint})` : ''}`,
	)
	const pat = await getGitHubPat()
	if (!pat) {
		return
	}

	try {
		const { stdout } = await execa('uv', [
			'tool',
			'install',
			`git+https://${pat}@github.com/${owner}/${repo}@v${release.version}`,
		])
		log.info(stdout)
	} catch (error) {
		log.error(
			`Error installing ${owner}/${repo}@v${release.version}: ${error instanceof Error ? error.message : String(error)}`,
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
			log.error(`Error downloading asset: ${response.statusText}`)
			return
		}

		const temporaryDirectory = join(tmpdir(), 'itson')
		await mkdir(temporaryDirectory, { recursive: true })
		const filePath = join(temporaryDirectory, asset.name)

		// @ts-expect-error - Readable.fromWeb is experimental
		// eslint-disable-next-line node/no-unsupported-features/node-builtins
		await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath))

		const fileStats = await stat(filePath)
		log.debug(`Downloaded ${asset.name} (${(fileStats.size / 1024).toFixed(2)} KB) to ${filePath}`)

		if (asset.name.endsWith('.zip')) {
			return await unzip(filePath)
		}

		return filePath
	} catch (error) {
		log.error(`Error downloading asset: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Update an app or task from a GitHub release
 * @public
 */
// eslint-disable-next-line complexity
export async function updateFromGitHubRelease(
	owner: string,
	repo: string,
	destination: string,
	artifactPattern: RegExp,
	versionConstraint?: string,
): Promise<Array<string | undefined>> {
	const downloadedPaths: Array<string | undefined> = []

	const localVersion = await getVersion(destination)

	// If we have a local version and an EXACT version constraint, check if it matches
	// For range constraints (^, ~, etc.), we still want aggressive updates within the range
	if (
		localVersion &&
		versionConstraint &&
		semver.valid(versionConstraint) &&
		semver.eq(localVersion, versionConstraint)
	) {
		log.info(`${destination} is already at the exact version specified: ${localVersion}.`)
		return downloadedPaths
	}

	const release = await getBestReleaseForConstraint(owner, repo, versionConstraint)

	if (!release) {
		return downloadedPaths
	}

	// If we have a constraint, check if the release is different from local
	// For exact versions, allow downgrades; for ranges, only upgrade
	if (localVersion && versionConstraint) {
		// Check if this is an exact version using semver API
		const isExactVersion = semver.valid(versionConstraint) !== null
		if (!isExactVersion && !semver.gt(release.version, localVersion)) {
			// For range constraints, only upgrade
			log.info(
				`${destination} is already up to date with version ${localVersion} (best available: ${release.version}).`,
			)
			return downloadedPaths
		}
		// For exact versions, we already checked equality above, so if we're here, proceed with install
	}

	// If no constraint but local version is same or newer than release, skip
	if (localVersion && !versionConstraint && !semver.gt(release.version, localVersion)) {
		log.info(`${destination} is already up to date with version ${localVersion}.`)
		return downloadedPaths
	}

	const filteredArtifacts = release.artifacts.filter((artifact) =>
		artifactPattern.test(artifact.name),
	)

	if (filteredArtifacts.length === 0) {
		log.warn(
			`No matching release assets found for "${owner}/${repo}" with version ${release.version}.`,
		)
		return downloadedPaths
	}

	const isDowngrade = localVersion && semver.lt(release.version, localVersion)
	const action = isDowngrade ? 'Downgrading to' : 'Upgrading to'
	log.info(
		`${action} release version: ${release.version}${versionConstraint ? ` (satisfies ${versionConstraint})` : ''}`,
	)
	log.withMetadata(filteredArtifacts).debug('Release artifacts:')

	const pat = await getGitHubPat()
	if (pat) {
		for (const artifact of filteredArtifacts) {
			let downloadedPath = await downloadReleaseAsset(artifact, pat)
			if (downloadedPath && destination) {
				const destinationPath = destination
				await rm(destinationPath, { force: true, recursive: true })
				await rename(downloadedPath, destinationPath)
				downloadedPath = destinationPath
				log.info(`Moved ${basename(downloadedPath)} to ${destination}`)
			}
			downloadedPaths.push(downloadedPath)
		}
	}
	return downloadedPaths
}

/**
 * Update all apps and tasks in the config
 * @public
 */
export async function updateAllAppsAndTasks(config: ItsonConfig) {
	if (config.offline) {
		log.info('Skipping app and task updates in offline mode')
		return
	}

	const appsAndTasks = [...config.applications, ...config.tasks]

	if (!appsAndTasks.some((appOrTask) => appOrTask.update !== undefined)) {
		log.info('No apps or tasks have defined update strategies. Skipping app and task updates.')
		return
	}

	if (!(await isOnline({ timeout: 60_000 }))) {
		log.error('No internet access detected. Skipping app and task updates.')
		return
	}

	for (const appOrTask of appsAndTasks) {
		if (appOrTask.update !== undefined) {
			if (appOrTask.update.type === 'github') {
				const downloadedPaths = await updateFromGitHubRelease(
					appOrTask.update.owner,
					appOrTask.update.repo,
					appOrTask.update.destination,
					appOrTask.update.artifactPattern,
					appOrTask.update.version,
				)

				for (const downloadedPath of downloadedPaths) {
					// eslint-disable-next-line max-depth
					if (downloadedPath) {
						const version = await getVersion(downloadedPath)
						// eslint-disable-next-line max-depth
						if (version) {
							log.info(`Version of ${basename(downloadedPath)}: ${version}`)
						}
					} else {
						log.error(`No downloaded path for ${appOrTask.name}`)
					}
				}
				// eslint-disable-next-line ts/no-unnecessary-condition
			} else if (appOrTask.update.type === 'github-python') {
				await updateFromGitHubPythonRelease(
					appOrTask.update.owner,
					appOrTask.update.repo,
					appOrTask.command,
					appOrTask.update.version,
				)
			}
		}
	}
}
