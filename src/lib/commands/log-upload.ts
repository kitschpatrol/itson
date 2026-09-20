import { log } from 'lognow'
import plur from 'plur'
import type { ItsonConfig, ItsonConfigApp, ItsonConfigTask } from '../config'
import { S3FolderSync } from '../log-uploader'
import { checkOnline } from '../utilities'

/**
 * Upload the logs for a single application
 *
 * @public
 */
export async function uploadLogs(appOrTask: ItsonConfigApp | ItsonConfigTask) {
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
		const { newCount, skippedCount, updatedCount } = await logUploader.sync()
		const uploadedCount = newCount + updatedCount
		log.info(
			`Uploaded ${uploadedCount} log ${plur('file', uploadedCount)} for ${appOrTask.name} (${newCount} new, ${updatedCount} updated, ${skippedCount} up to date)`,
		)
	} catch (error) {
		log.withError(error).error(`Log upload for ${appOrTask.name} failed:`)
	}
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
	if (appsAndTasks.every((appOrTask) => appOrTask.logUpload === undefined)) {
		log.info('No apps or tasks have defined log upload strategies. Skipping log uploads.')
		return
	}

	if (!(await checkOnline())) {
		log.error('No internet access detected. Skipping log uploads.')
		return
	}

	// Upload all application logs
	for (const appOrTask of appsAndTasks) {
		await uploadLogs(appOrTask)
	}
}
