# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.8] - 2026-11-02

### Maintenance

- Refresh runtime dependency requirements, including minimatch 11, AWS S3 SDK, cron-parser, cronstrue, execa, lognow, and zod.
- Update shared-config, build and test tooling, pnpm, and GitHub Actions, and remove obsolete dependency release-age exceptions.
- Build before lint and fix commands, and manage contributor skills through pnpm configuration instead of a prepare script.
- Run dependency-update automation monthly and make link checks exclude loopback URLs and tolerate empty input.

## [0.7.7] - 2026-10-06

### Changed

- **Breaking:** Require Node.js `^24.16.0 || >=26.3.0`, dropping Node.js 25 and Node.js 26 versions below 26.3.0.

### Documentation

- Update runtime requirements and installation guidance, including running through `npx` without a global installation.

### Maintenance

- Refresh AWS S3 SDK, cronstrue, and lognow requirements.
- Refresh development dependencies and pnpm, add contributor skill synchronization during preparation, and simplify lint configuration.
- Add weekly automated dependency-update PRs and correct error capture in website link checking.

## [0.7.6] - 2026-09-21

### Added

- Add Homebrew installation through `kitschpatrol/tap/itson`.

### Documentation

- Document Homebrew installation and upgrades alongside npm instructions.

### Maintenance

- Update AWS S3 SDK, lognow, and yargs requirements.
- Integrate brewpub into the release script to update the Homebrew tap after npm publication.

## [0.7.5] - 2026-09-20

### Changed

- Report service registration and application startup at normal verbosity only when their state changes.
- Summarize each application's log upload with counts of new, updated, and unchanged files.

### Fixed

- Restart applications after changed launchd configuration is reloaded instead of incorrectly treating them as still running.
- Report missing credentials and failed S3 operations as upload failures instead of logging successful completion.

## [0.7.4] - 2026-09-20

### Fixed

- Retry connectivity probes for up to 90 seconds to handle delayed DHCP initialization at boot, with verbose diagnostics for failed probes.

### Documentation

- Add the GitHub-maintained keytar fork to the keychain implementation references.

### Maintenance

- Replace `keytar-forked` with `@github/keytar` and update native-module build configuration and integration tests.

## [0.7.3] - 2026-09-20

### Fixed

- Correct logging timestamps.

### Maintenance

- Refresh runtime dependencies for S3 uploads, prompts, cron handling, logging, and configuration validation, and replace the exact S3 SDK pin with a compatible range.
- Update shared-config, Node.js types, Vitest, pnpm, and GitHub Actions, remove expired release-age exceptions, and apply lint-driven refactoring.

## [0.7.2] - 2026-09-09

### Added

- Add `itson config` to open existing configuration, including malformed files, or create a commented TypeScript starter with editor types and application, task, update, and upload examples.

### Documentation

- Document configuration creation and editing through `itson config` and add it to the command reference.

## [0.7.1] - 2026-09-08

### Fixed

- Force `uv tool install` to replace lingering executables when installation records are out of sync, avoiding executable-already-exists failures.

## [0.7.0] - 2026-09-08

### Added

- Support JSON and JSONC configuration with a published JSON Schema and regex patterns expressed as strings or `{ source, flags }` objects.
- Install and refresh standalone configuration type definitions in `~/.itson` for JavaScript and TypeScript editor checking and autocomplete.
- Validate configuration on load with readable errors for invalid fields, regexes, unsupported schedules, duplicate or invalid names, and reserved startup-task names.
- Expand `~` in commands, arguments, update destinations, and log source paths, including arguments such as `--config=~/settings.json`.

### Changed

- **Breaking:** Raise the minimum supported Node.js version from 22.12.0 to 24.16.0.

### Fixed

- Continue to application startup when registration, updates, or log uploads throw errors.
- Skip credential prompts without an interactive terminal so missing keychain entries cannot indefinitely block startup.
- Share one connectivity check between updates and log uploads, avoiding duplicate offline delays before applications start.
- Preserve and restore the previous application when replacement fails, with a copy fallback for updates moved across volumes.
- Enforce abort timeouts for GitHub API calls and release-asset downloads so stalled connections cannot block launch indefinitely.
- Generate every calendar combination for cron fields containing multiple values, preventing scheduled runs from being dropped.
- Improve Cloudflare R2 and S3-compatible uploads by declaring content length and sending optional checksums only when required.
- Honor `verbose: true` from configuration while preserving CLI overrides.
- Warn when no configuration file exists and report the resolved path when one is loaded.

### Security

- Redact GitHub personal access tokens from Python installation output and error messages before writing logs.

### Documentation

- Add JSON, JSONC, JavaScript, and TypeScript configuration examples covering schema validation, editor types, regex representations, and home-directory expansion.
- Update Node.js requirements, contributor guidance, implementation references, and generated CLI documentation.

### Maintenance

- Declare CLI runtime modules as production dependencies and refresh runtime requirements, including plist 5, execa 10, and the S3 SDK.
- Refresh development tooling to pnpm 12, TypeScript 6, and Vitest 5, fix shared-config hoisting, and add package-build validation.
- Add macOS build, lint, and test CI plus expanded configuration, plist, utility, log-upload, keychain, and launchd tests using a temporary CI keychain.
- Add automated Markdown and website link checking.
- Refresh GitHub Actions and publishing authentication, and simplify release-tag validation against the repository's default branch.

## [0.6.3] - 2025-11-08

### Changed

- Move routine service, credential, and upload details behind `--verbose`, retaining concise upload and credential-removal counts.

### Documentation

- Acknowledge the crontab-to-launchd project that informed cron scheduling conversion.

## [0.6.2] - 2025-11-07

### Changed

- Identify applications and tasks by configured name in update messages and report original artifact names when moving downloads.

## [0.6.1] - 2025-11-07

### Changed

- Stop printing raw service options whenever launchd property lists are generated.

### Documentation

- Clarify that task schedules use local time rather than UTC.

## [0.6.0] - 2025-11-07

### Added

- Schedule short-running tasks through launchd using cron expressions or `@reboot`, with GitHub updates and log uploads available for tasks.
- Introduce default configuration values and offline and verbose configuration fields with CLI overrides; `--offline` skips updates and uploads immediately.
- Automatically remove orphaned launchd services that are no longer present in configuration.

### Changed

- Write application and task stdout and stderr logs to `~/Library/Logs` instead of `/tmp`.
- Apply current registration settings before `start`, `stop`, `update`, and `upload-logs` commands.

### Documentation

- Add scheduled-task examples, explain task versus application lifecycles and explicit offline mode, and update command help to include tasks.

### Maintenance

- Replace interpolated launchd XML with structured plist generation and add Vitest coverage for cron conversion.
- Refresh logging, build, and lint tooling, add local install and uninstall scripts, and update pnpm build and dependency-override configuration.

## [0.5.3] - 2025-11-05

### Maintenance

- Update lognow and CLI-help generation dependencies.
- Configure tsdown to emit `.js` files and align the CLI executable entry point with that output.

## [0.5.2] - 2025-11-04

### Documentation

- Document global npm updates and explain how unavailable connectivity causes updates and log uploads to be skipped.

### Maintenance

- Restrict npm package contents to build output and automatically included package metadata.

## [0.5.1] - 2025-11-04

### Fixed

- Check connectivity before updates and log uploads, allowing up to 60 seconds per check and skipping unavailable network operations so launch can continue.

### Documentation

- Restore the generated CLI command and option reference in the README.

## [0.5.0] - 2025-11-04

### Added

- Enable persistent JSON file logging through lognow, with the log destination available in verbose output.

### Fixed

- Add a Node.js interpreter directive so the distributed CLI can execute directly.
- Route Python updater output through the configured logger.

### Documentation

- Expand implementation references for binary management, service supervision, and scheduling, and remove the generated README command table.

### Maintenance

- Refresh runtime dependencies, including c12, Octokit, minimatch, and semver, and pin the S3 SDK requirement.
- Replace pkgroll with tsdown, consolidate logging on lognow, refresh development tooling, and switch local npm publishing to token authentication.

## [0.4.0] - 2025-09-19

### Fixed

- Keep launch agents in the user's Aqua session so startup processes can access saved keychain credentials.

### Documentation

- Explain manual rollback through version pinning and add `upload-logs` to the generated command reference.

### Maintenance

- Update c12 and the S3 SDK requirements.
- Refresh TypeScript, pnpm, and build tooling, migrate lint commands from `kpi` to `ksc`, and update mdat configuration.

## [0.3.1] - 2025-08-17

### Changed

- Reject unrecognized CLI commands and options.

## [0.3.0] - 2025-08-16

### Added

- Support exact versions and semver ranges for GitHub binary and Python updates, selecting the highest matching release and allowing downgrades to exact pinned versions.
- Allow custom log-upload ignore patterns in addition to the default exclusions.

### Fixed

- Make `--verbose` enable debug logging and move detailed update diagnostics out of normal output.

### Documentation

- Explain version constraints, S3 folder synchronization, credential persistence, and log uploads in the launch sequence.

### Maintenance

- Refresh build and release tooling and Node.js types, and remove unused minimatch types and tslog.

## [0.2.0] - 2025-08-10

### Added

- Add `upload-logs` and upload logs during `launch`, recursively syncing configured application folders to S3-compatible buckets while preserving remote files.
- Support custom S3 endpoints and remote prefixes, incremental uploads, common file exclusions, and keychain-backed S3 credentials.
- Provide a macOS exhibit setup script covering system preferences, sleep prevention, wake-on-network, and automatic restart after power loss.

### Documentation

- Update the documented project scope to include S3 log uploads.

## [0.1.2] - 2025-08-04

### Fixed

- Register the startup service using `itson` from PATH instead of a developer-specific absolute path.

## [0.1.1] - 2025-08-04

### Fixed

- Use the application's `command` for Python CLI version checks, eliminating the separate `update.cli` setting and identifying applications in update-status messages.

## [0.1.0] - 2025-08-03

### Added

- Ship an npm-installable macOS CLI for Node.js 22.12 or newer, with a default `launch` workflow and explicit `start`, `stop`, `update`, `register`, and `reset` commands.
- Read application names, commands, arguments, update strategies, and startup settings from a configuration file in the user's home directory.
- Manage persistent launchd agents that launch applications, restart them after exits or crashes, and capture stdout and stderr logs.
- Install matching binary assets and ZIP app bundles from GitHub releases, comparing installed app versions before updating.
- Install and update Python CLI applications from private GitHub repositories through `uv tool`.
- Store GitHub credentials in the system keychain, with `reset` clearing credentials and removing registered services.

### Documentation

- Document installation, configuration examples, CLI commands, private-repository permissions, platform requirements, and the native service-management architecture.

### Maintenance

- Establish TypeScript builds, shared lint configuration, pnpm development setup, local publishing scripts, and GitHub release and metadata workflows.

[0.1.0]: https://github.com/kitschpatrol/itson/releases/tag/v0.1.0
[0.1.1]: https://github.com/kitschpatrol/itson/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/kitschpatrol/itson/compare/v0.1.1...v0.1.2
[0.2.0]: https://github.com/kitschpatrol/itson/compare/v0.1.2...v0.2.0
[0.3.0]: https://github.com/kitschpatrol/itson/compare/v0.2.0...v0.3.0
[0.3.1]: https://github.com/kitschpatrol/itson/compare/v0.3.0...v0.3.1
[0.4.0]: https://github.com/kitschpatrol/itson/compare/v0.3.1...v0.4.0
[0.5.0]: https://github.com/kitschpatrol/itson/compare/v0.4.0...v0.5.0
[0.5.1]: https://github.com/kitschpatrol/itson/compare/v0.5.0...v0.5.1
[0.5.2]: https://github.com/kitschpatrol/itson/compare/v0.5.1...v0.5.2
[0.5.3]: https://github.com/kitschpatrol/itson/compare/v0.5.2...v0.5.3
[0.6.0]: https://github.com/kitschpatrol/itson/compare/v0.5.3...v0.6.0
[0.6.1]: https://github.com/kitschpatrol/itson/compare/v0.6.0...v0.6.1
[0.6.2]: https://github.com/kitschpatrol/itson/compare/v0.6.1...v0.6.2
[0.6.3]: https://github.com/kitschpatrol/itson/compare/v0.6.2...v0.6.3
[0.7.0]: https://github.com/kitschpatrol/itson/compare/v0.6.3...v0.7.0
[0.7.1]: https://github.com/kitschpatrol/itson/compare/v0.7.0...v0.7.1
[0.7.2]: https://github.com/kitschpatrol/itson/compare/v0.7.1...v0.7.2
[0.7.3]: https://github.com/kitschpatrol/itson/compare/v0.7.2...v0.7.3
[0.7.4]: https://github.com/kitschpatrol/itson/compare/v0.7.3...v0.7.4
[0.7.5]: https://github.com/kitschpatrol/itson/compare/v0.7.4...v0.7.5
[0.7.6]: https://github.com/kitschpatrol/itson/compare/v0.7.5...v0.7.6
[0.7.7]: https://github.com/kitschpatrol/itson/compare/v0.7.6...v0.7.7
[0.7.8]: https://github.com/kitschpatrol/itson/compare/v0.7.7...v0.7.8
