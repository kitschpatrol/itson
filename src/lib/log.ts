/* eslint-disable perfectionist/sort-classes */

import type { RotatingFileStream } from 'rotating-file-stream'
import type { ILogObj, ILogObjMeta, IMeta, ISettingsParam } from 'tslog'
import filenamify from 'filenamify'
import path from 'node:path'
import { promisify } from 'node:util'
import { readPackageJSON } from 'pkg-types'
import { createStream } from 'rotating-file-stream'
import { Logger as TsLogLogger } from 'tslog'

const NON_VERBOSE_MIN_LEVEL = 4 // Warn
const VERBOSE_MIN_LEVEL = 0 // Debug

// Match settings

// Via type-fest
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {}

export type LogObject = {
	args: unknown[]
	meta: Simplify<
		IMeta & {
			// Missing from tslog type definitions for some reason...
			hostname?: string
			runtime?: string
			runtimeVersion?: string
		}
	>
}

class CustomTsLogLogger<T extends ILogObj = ILogObj> extends TsLogLogger<T> {
	private logDirectory: string | undefined
	private logFileName: string | undefined
	// eslint-disable-next-line ts/naming-convention
	private _debugLogObjects = false
	private rotatingFileStream: RotatingFileStream | undefined
	private tempMeta: LogObject['meta'] | undefined

	private logFileTransportCreated = false
	private debugLogObjectsTransportCreated = false

	constructor(settings?: ISettingsParam<T>, logObject?: T) {
		super(
			{
				argumentsArrayName: 'args',
				// Reverse the tslog default...
				hideLogPositionForProduction: true,
				metaProperty: 'meta',
				prettyLogTimeZone: 'local',
				...settings,
			},
			logObject,
		)

		// Must have NODE_OPTIONS=--enable-source-maps set?
		// See https://github.com/alex8088/electron-vite/discussions/133
		this.logDirectory = undefined
		this.rotatingFileStream = undefined

		// See https://github.com/fullstack-build/tslog/issues/302
		// Still needed with TsLog 4...
		// @ts-expect-error - setting this private member as a workaround for https://github.com/fullstack-build/tslog/issues/302
		this.stackDepthLevel = 7

		// const isBrowser = (globalThis.window as unknown) !== undefined

		// The logic below lets us handle "raw" log objects sent from the renderer process
		// For now it's only used on the main process, but we could use it on the renderer process too
		// if we wanted to. Probably.

		// The masked values get passed pretty far down the super's log method,
		// we have to intercept, spread the args, and store the meta elsewhere
		// This means we can NOT overwrite the mask method otherwise.
		this.settings.overwrite!.mask = (args: unknown[]): unknown[] => {
			// Detect inbound from renderer
			if (args.length === this.settings.prefix.length + 2 && args.at(-1) === '__LOG_RAW_OBJECT__') {
				// First element is the log argument array
				// eslint-disable-next-line ts/no-unsafe-type-assertion
				const logObject = args.at(-2) as LogObject

				// Remove the meta key and value and store it for later
				this.tempMeta = logObject.meta
				args = logObject.args
			}

			// Default behavior
			if (
				// eslint-disable-next-line ts/no-unnecessary-condition
				this.settings.maskValuesOfKeys !== undefined &&
				this.settings.maskValuesOfKeys.length > 0
			) {
				// @ts-expect-error - setting this private member as a workaround for https://github.com/fullstack-build/tslog/issues/302
				// eslint-disable-next-line ts/no-unsafe-type-assertion, ts/no-unsafe-call
				return this._mask(args) as unknown[]
			}

			return args
		}

		// This means we can NOT overwrite the addMeta method otherwise.
		this.settings.overwrite!.addMeta = (
			logObject: T,
			logLevelId: number,
			logLevelName: string,
		): ILogObjMeta & T => {
			if (this.tempMeta !== undefined) {
				// Add the meta to the log object
				// eslint-disable-next-line ts/consistent-type-assertions, ts/no-unsafe-type-assertion
				const result = { ...logObject, meta: this.tempMeta } as ILogObjMeta & T
				this.tempMeta = undefined
				return result
			}

			// @ts-expect-error - setting this private member as a workaround for https://github.com/fullstack-build/tslog/issues/302
			// eslint-disable-next-line ts/no-unsafe-call, ts/no-unsafe-type-assertion
			return this._addMetaToLogObj(logObject, logLevelId, logLevelName) as ILogObjMeta & T
		}
	}

	public get verbose(): boolean {
		return this.settings.minLevel === VERBOSE_MIN_LEVEL
	}

	public set verbose(value: boolean) {
		this.settings.minLevel = value ? VERBOSE_MIN_LEVEL : NON_VERBOSE_MIN_LEVEL
	}

	public get showCallSite(): boolean {
		return !this.settings.hideLogPositionForProduction
	}

	public set showCallSite(value: boolean) {
		this.settings.hideLogPositionForProduction = !value

		// @ts-expect-error - Have to call private functions from BaseLogger to refresh the value
		// eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-call
		this.captureStackForMeta = this._shouldCaptureStack()
	}

	public getLogFileDirectory(): string | undefined {
		return this.logDirectory
	}

	public async getLogFileName(): Promise<string> {
		// Lazy load the log file name
		if (this.logFileName === undefined) {
			const localPackageJson = await readPackageJSON(undefined, {
				from: import.meta.url,
			})
			if (!localPackageJson.name) {
				throw new Error('Could not find package name in package.json')
			}
			this.logFileName = `${filenamify(localPackageJson.name, { replacement: '-' })}.log`
		}
		return this.logFileName
	}

	/**
	 * Get the path to the log file.
	 * @readonly
	 * @returns The absolute path to the log file, or undefined if the log file directory is not set and file logging is disabled.
	 */
	public async getLogFilePath(): Promise<string | undefined> {
		const logFileName = await this.getLogFileName()
		const logFileDirectory = this.getLogFileDirectory()
		return logFileDirectory ? path.resolve(path.join(logFileDirectory, logFileName)) : undefined
	}

	public logRawObject(theLogObject: LogObject & T): (LogObject & T) | undefined {
		const result = this.log(
			theLogObject.meta.logLevelId,
			theLogObject.meta.logLevelName,
			theLogObject,
			// Append argument to the log object to indicate that it is a raw object
			// when caught by the addMeta overwrite
			'__LOG_RAW_OBJECT__',
		)

		// eslint-disable-next-line ts/no-unsafe-type-assertion
		return result as unknown as LogObject & T
	}

	public get debugLogObjects(): boolean {
		return this._debugLogObjects
	}

	public set debugLogObjects(value: boolean) {
		this._debugLogObjects = value

		// No way to destroy the transport, so we have to check if it's already created
		if (value && !this.debugLogObjectsTransportCreated) {
			this.debugLogObjectsTransportCreated = true
			this.attachTransport((logObject) => {
				if (this._debugLogObjects) {
					console.log(JSON.stringify(logObject, undefined, 2))
				}
			})
		}
	}

	/**
	 * Enable file logging and set the directory to write the log file to.
	 * Pass undefined to disable file logging.
	 * @param directoryPath - The directory to write the log file to.
	 */
	public async setLogFileDirectory(directoryPath: string | undefined) {
		if (this.logDirectory === directoryPath) {
			// No change
			return
		}

		// Destroy if it exists
		if (this.rotatingFileStream) {
			const endPromise = promisify(this.rotatingFileStream.end.bind(this.rotatingFileStream))
			await endPromise()
			this.rotatingFileStream = undefined
		}

		if (directoryPath === undefined) {
			this.logDirectory = undefined
			return
		}

		// Path is different and defined, create a new stream
		this.logDirectory = directoryPath
		const logFileName = await this.getLogFileName()
		this.rotatingFileStream = createStream(logFileName, {
			compress: 'gzip',
			interval: '1d',
			path: this.logDirectory,
		})

		// No way to destroy the transport, so we have to check if it's already created
		if (!this.logFileTransportCreated) {
			this.logFileTransportCreated = true
			this.attachTransport((logObject) => {
				// Only write if the stream exists (it may be destroyed by setLogFileDirectory(undefined))
				if (this.rotatingFileStream) {
					// Maybe
					// sortLogObjectKeys(logObject)
					this.rotatingFileStream.write(JSON.stringify(logObject) + '\n')
				}
			})
		}
	}
}

// Facade pattern...
class Logger implements ConsoleLogger {
	private static rootLogger: CustomTsLogLogger<LogObject> | undefined

	private static getRootLogger(): CustomTsLogLogger<LogObject> {
		Logger.rootLogger ??= new CustomTsLogLogger<LogObject>()
		return Logger.rootLogger
	}

	private readonly logger: CustomTsLogLogger<LogObject>

	constructor(parentLogger?: CustomTsLogLogger<LogObject>, name?: string) {
		this.logger =
			parentLogger === undefined
				? Logger.getRootLogger()
				: // eslint-disable-next-line ts/no-unsafe-type-assertion
					(parentLogger.getSubLogger({
						name: name ?? (parentLogger.settings.name === undefined ? undefined : 'SubLogger'),
					}) as CustomTsLogLogger<LogObject>)
	}

	// Settings object to expose configuration
	get settings() {
		// eslint-disable-next-line prefer-destructuring
		const logger = this.logger
		return {
			get debugLogObjects(): boolean {
				return logger.debugLogObjects
			},
			set debugLogObjects(value: boolean) {
				logger.debugLogObjects = value
			},
			getLogFileDirectory(): string | undefined {
				return logger.getLogFileDirectory()
			},
			async getLogFilePath(): Promise<string | undefined> {
				return logger.getLogFilePath()
			},
			get name(): string | undefined {
				return logger.settings.name
			},
			set name(value: string | undefined) {
				logger.settings.name = value
			},
			async setLogFileDirectory(directoryPath: string | undefined): Promise<void> {
				await logger.setLogFileDirectory(directoryPath)
			},
			get showCallSite(): boolean {
				return logger.showCallSite
			},
			set showCallSite(value: boolean) {
				logger.showCallSite = value
			},
			get verbose(): boolean {
				return logger.verbose
			},
			set verbose(value: boolean) {
				logger.verbose = value
			},
		}
	}

	public getSubLogger(name?: string): Logger {
		return new Logger(this.logger, name)
	}

	/**
	 * Log a structured log object directly, useful across process boundaries.
	 * The logger name is ignored.
	 */
	logObject(structuredLogObject: LogObject): LogObject | undefined {
		return this.logger.logRawObject(structuredLogObject)
	}

	/** Level 1, hidden unless verbose */
	trace(...args: unknown[]): LogObject | undefined {
		return this.logger.trace(...args)
	}

	/** Level 2, hidden unless verbose */
	debug(...args: unknown[]): LogObject | undefined {
		return this.logger.debug(...args)
	}

	/** Level 3, hidden unless verbose */
	info(...args: unknown[]): LogObject | undefined {
		return this.logger.info(...args)
	}

	/** Level 3, alias for INFO */
	log(...args: unknown[]): LogObject | undefined {
		return this.logger.log(3, 'INFO', ...args)
	}

	/** Level 4 */
	warn(...args: unknown[]): LogObject | undefined {
		return this.logger.warn(...args)
	}

	/** Level 5 */
	error(...args: unknown[]): LogObject | undefined {
		return this.logger.error(...args)
	}

	/** Level 6 */
	fatal(...args: unknown[]): LogObject | undefined {
		return this.logger.fatal(...args)
	}
}

export type ConsoleLogger = {
	debug: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	log: (...args: unknown[]) => void
	trace: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
}

export const log = new Logger()
