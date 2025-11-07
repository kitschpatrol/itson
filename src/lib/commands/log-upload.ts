import isOnline from 'is-online'
import { log } from 'lognow'
import type { ItsonConfig, ItsonConfigApplication, ItsonConfigTask } from '../config'
import { S3FolderSync } from '../log-uploader'

/**
 * Upload the logs for a single application
 * @public
 */
export async function uploadLogs(appOrTask: ItsonConfigApplication | ItsonConfigTask) {
	if (!appOrTask.logUpload) {
		log.info(`No log upload strategy found for ${appOrTask.name}, skipping...`)
		return
	}

	// eslint-disable-next-line ts/no-unnecessary-condition
	if (appOrTask.logUpload.type !== 's3') {
		// eslint-disable-next-line ts/restrict-template-expressions
		log.error(`Unsupported log upload type: ${appOrTask.logUpload.type}`)
		return
	}

	log.info(
		`Uploading logs for ${appOrTask.name} from ${appOrTask.logUpload.localPath} to ${appOrTask.logUpload.bucketName}/${appOrTask.logUpload.remotePath}`,
	)

	const logUploader = new S3FolderSync(appOrTask.logUpload)
	try {
		await logUploader.sync()
	} catch (error) {
		log.error(`Error uploading logs for ${appOrTask.name}: ${String(error)}`)
	}

	log.info(`Logs uploaded for ${appOrTask.name}`)
}

/**
 * Upload all app and task logs
 */
export async function uploadAllLogs(config: ItsonConfig) {
	if (config.offline) {
		log.info('Skipping log uploads in offline mode')
		return
	}

	log.info('Uploading all application logs')

	const appsAndTasks = [...config.applications, ...config.tasks]

	// Do any apps or tasks have non-undefined log upload strategies?
	if (!appsAndTasks.some((appOrTask) => appOrTask.logUpload !== undefined)) {
		log.info('No apps or tasks have defined log upload strategies. Skipping log uploads.')
		return
	}

	if (!(await isOnline({ timeout: 60_000 }))) {
		log.error('No internet access detected. Skipping log uploads.')
		return
	}

	// Upload all application logs
	for (const appOrTask of appsAndTasks) {
		await uploadLogs(appOrTask)
	}
}
