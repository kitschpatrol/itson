// @case-police-ignore Api
import { Octokit } from '@octokit/rest'
import { execa } from 'execa'
import findVersions from 'find-versions'
import keytar from 'keytar-forked'
import { log } from 'lognow'
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import semver from 'semver'
import type { ItsonConfig } from '../../lib/config.js'
import { KEYCHAIN_SERVICE } from '../../lib/constants.js'
import {
	checkOnline,
	getVersion,
	promptForSecret,
	redactSecret,
	replacePath,
	unzip,
} from '../../lib/utilities.js'

const GITHUB_PAT_ACCOUNT = 'github-pat'
const V_PREFIX_REGEX = /^v/v

async function getGitHubPat(): Promise<string | undefined> {
	let pat = (await keytar.getPassword(KEYCHAIN_SERVICE, GITHUB_PAT_ACCOUNT)) ?? undefined

	if (pat === undefined || pat.length === 0) {
		log.warn('GitHub Personal Access Token not found')

		const newPat = await promptForSecret(
			'Please enter your GitHub Personal Access Token (PAT) with `repo` scope:',
			(value) =>
				value.startsWith('github_pat_')
					? undefined
					: 'Please enter a valid GitHub Personal Access Token.',
		)

		if (newPat === undefined) {
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
 *
 * @public
 */
export async function getAllReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
	const pat = await getGitHubPat()
	if (pat === undefined) {
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
			version: release.tag_name.replace(V_PREFIX_REGEX, ''),
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
	if (pat === undefined) {
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
			version: latestRelease.tag_name.replace(V_PREFIX_REGEX, ''),
		}
	} catch (error) {
		log.error(
			`Error fetching latest release for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
		)
		return undefined
	}
}

/**
 * Find the best release that satisfies a semver constraint
 *
 * @public
 */
export async function getBestReleaseForConstraint(
	owner: string,
	repo: string,
	versionConstraint?: string,
): Promise<GitHubRelease | undefined> {
	// If no constraint provided, use latest release
	if (versionConstraint === undefined || versionConstraint.length === 0) {
		return getLatestRelease(owner, repo)
	}

	const allReleases = await getAllReleases(owner, repo)
	if (allReleases.length === 0) {
		return undefined
	}

	// Filter releases that satisfy the constraint and sort by version (highest first)
	const satisfyingReleases = allReleases
		.filter((release) => {
			const version = semver.valid(release.version) ?? undefined
			return version !== undefined && semver.satisfies(version, versionConstraint)
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
	/** For Logging only */
	name: string,
	owner: string,
	repo: string,
	cli: string,
	versionConstraint?: string,
): Promise<void> {
	const localVersion = await getVersionFromCLI(cli)

	// If we have a local version and an EXACT version constraint, check if it matches
	// For range constraints (^, ~, etc.), we still want aggressive updates within the range
	if (
		localVersion !== undefined &&
		versionConstraint !== undefined &&
		semver.valid(versionConstraint) !== null &&
		semver.eq(localVersion, versionConstraint)
	) {
		log.info(`${name} is already at the exact version specified: ${localVersion}.`)
		return
	}

	const release = await getBestReleaseForConstraint(owner, repo, versionConstraint)

	if (!release) {
		return
	}

	// If we have a constraint, check if the release is different from local
	// For exact versions, allow downgrades; for ranges, only upgrade
	if (localVersion !== undefined && versionConstraint !== undefined) {
		// Check if this is an exact version using semver API
		const isExactVersion = semver.valid(versionConstraint) !== null
		if (!isExactVersion && !semver.gt(release.version, localVersion)) {
			// For range constraints, only upgrade
			log.info(
				`${name} is already up to date with version ${localVersion} (best available: ${release.version}).`,
			)
			return
		}
		// For exact versions, we already checked equality above, so if we're here, proceed with install
	}

	// If no constraint but local version is same or newer than release, skip
	if (
		localVersion !== undefined &&
		versionConstraint === undefined &&
		!semver.gt(release.version, localVersion)
	) {
		log.info(`${name} is already up to date with version ${localVersion}.`)
		return
	}

	const isDowngrade = localVersion !== undefined && semver.lt(release.version, localVersion)
	const action = isDowngrade ? 'Downgrading to' : 'Installing'
	log.info(
		`${action} release version: ${release.version}${versionConstraint === undefined ? '' : ` (satisfies ${versionConstraint})`}`,
	)
	const pat = await getGitHubPat()
	if (pat === undefined) {
		return
	}

	// The PAT is embedded in the install URL, and execa echoes the full command
	// in its error messages, so redact it before anything reaches the logs
	try {
		const { stdout } = await execa('uv', [
			'tool',
			'install',
			`git+https://${pat}@github.com/${owner}/${repo}@v${release.version}`,
		])
		log.info(redactSecret(stdout, pat))
	} catch (error) {
		log.error(
			`Error installing ${owner}/${repo}@v${release.version}: ${redactSecret(error instanceof Error ? error.message : String(error), pat)}`,
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

		await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath))

		const fileStats = await stat(filePath)
		log.debug(`Downloaded ${asset.name} (${(fileStats.size / 1024).toFixed(2)} KB) to ${filePath}`)

		if (asset.name.endsWith('.zip')) {
			return await unzip(filePath)
		}

		return filePath
	} catch (error) {
		log.error(`Error downloading asset: ${error instanceof Error ? error.message : String(error)}`)
		return undefined
	}
}

/**
 * Update an app or task from a GitHub release
 *
 * @public
 */
// eslint-disable-next-line complexity
export async function updateFromGitHubRelease(
	/** For Logging only */
	name: string,
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
		localVersion !== undefined &&
		versionConstraint !== undefined &&
		semver.valid(versionConstraint) !== null &&
		semver.eq(localVersion, versionConstraint)
	) {
		log.info(`${name} is already at the exact version specified: ${localVersion}.`)
		return downloadedPaths
	}

	const release = await getBestReleaseForConstraint(owner, repo, versionConstraint)

	if (!release) {
		return downloadedPaths
	}

	// If we have a constraint, check if the release is different from local
	// For exact versions, allow downgrades; for ranges, only upgrade
	if (localVersion !== undefined && versionConstraint !== undefined) {
		// Check if this is an exact version using semver API
		const isExactVersion = semver.valid(versionConstraint) !== null
		if (!isExactVersion && !semver.gt(release.version, localVersion)) {
			// For range constraints, only upgrade
			log.info(
				`${name} is already up to date with version ${localVersion} (best available: ${release.version}).`,
			)
			return downloadedPaths
		}
		// For exact versions, we already checked equality above, so if we're here, proceed with install
	}

	// If no constraint but local version is same or newer than release, skip
	if (
		localVersion !== undefined &&
		versionConstraint === undefined &&
		!semver.gt(release.version, localVersion)
	) {
		log.info(`${name} is already up to date with version ${localVersion}.`)
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

	const isDowngrade = localVersion !== undefined && semver.lt(release.version, localVersion)
	const action = isDowngrade ? 'Downgrading to' : 'Upgrading to'
	log.info(
		`${action} release version: ${release.version}${versionConstraint === undefined ? '' : ` (satisfies ${versionConstraint})`}`,
	)
	log.withMetadata(filteredArtifacts).debug('Release artifacts:')

	const pat = await getGitHubPat()
	if (pat !== undefined) {
		for (const artifact of filteredArtifacts) {
			let downloadedPath = await downloadReleaseAsset(artifact, pat)
			if (downloadedPath !== undefined) {
				try {
					await replacePath(downloadedPath, destination)
					downloadedPath = destination
					log.info(`Moved ${artifact.name} to ${destination}`)
				} catch (error) {
					log.error(
						`Error moving ${artifact.name} to ${destination}: ${error instanceof Error ? error.message : String(error)}`,
					)
					downloadedPath = undefined
				}
			}

			downloadedPaths.push(downloadedPath)
		}
	}

	return downloadedPaths
}

/**
 * Update all apps and tasks in the config
 *
 * @public
 */
export async function updateAllAppsAndTasks(config: ItsonConfig) {
	if (config.offline) {
		log.info('Skipping app and task updates in offline mode')
		return
	}

	const appsAndTasks = [...config.applications, ...config.tasks]

	if (appsAndTasks.every((appOrTask) => appOrTask.update === undefined)) {
		log.info('No apps or tasks have defined update strategies. Skipping app and task updates.')
		return
	}

	if (!(await checkOnline())) {
		log.error('No internet access detected. Skipping app and task updates.')
		return
	}

	for (const appOrTask of appsAndTasks) {
		if (appOrTask.update !== undefined) {
			if (appOrTask.update.type === 'github') {
				const downloadedPaths = await updateFromGitHubRelease(
					appOrTask.name,
					appOrTask.update.owner,
					appOrTask.update.repo,
					appOrTask.update.destination,
					appOrTask.update.artifactPattern,
					appOrTask.update.version,
				)

				for (const downloadedPath of downloadedPaths) {
					// eslint-disable-next-line max-depth
					if (downloadedPath === undefined) {
						log.error(`No downloaded path for ${appOrTask.name}`)
					} else {
						const version = await getVersion(downloadedPath)
						// eslint-disable-next-line max-depth
						if (version !== undefined) {
							log.info(`Version of ${appOrTask.name}: ${version}`)
						}
					}
				}
				// eslint-disable-next-line ts/no-unnecessary-condition
			} else if (appOrTask.update.type === 'github-python') {
				await updateFromGitHubPythonRelease(
					appOrTask.name,
					appOrTask.update.owner,
					appOrTask.update.repo,
					appOrTask.command,
					appOrTask.update.version,
				)
			}
		}
	}
}
