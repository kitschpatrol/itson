import isOnline from 'is-online'
import { log } from 'lognow'
import type { ItsonConfig, ItsonConfigApplication } from '../config'
import { S3FolderSync } from '../log-uploader'

/**
 * Upload the logs for a single application
 * @public
 */
export async function uploadApplicationLogs(application: ItsonConfigApplication) {
	if (!application.logUpload) {
		log.info(`No log upload strategy found for ${application.name}, skipping...`)
		return
	}

	// eslint-disable-next-line ts/no-unnecessary-condition
	if (application.logUpload.type !== 's3') {
		// eslint-disable-next-line ts/restrict-template-expressions
		log.error(`Unsupported log upload type: ${application.logUpload.type}`)
		return
	}

	log.info(
		`Uploading logs for ${application.name} from ${application.logUpload.localPath} to ${application.logUpload.bucketName}/${application.logUpload.remotePath}`,
	)

	const applicationLogUploader = new S3FolderSync(application.logUpload)
	try {
		await applicationLogUploader.sync()
	} catch (error) {
		log.error(`Error uploading logs for ${application.name}: ${String(error)}`)
	}

	log.info(`Logs uploaded for ${application.name}`)
}

/**
 * Upload all application logs
 */
export async function uploadAllApplicationLogs(config: ItsonConfig) {
	log.info('Uploading all application logs')

	// Do any applications have non-undefined log upload strategies?
	if (!config.applications.some((application) => application.logUpload !== undefined)) {
		log.info(
			'No applications have defined log upload strategies. Skipping application log uploads.',
		)
		return
	}

	if (!(await isOnline({ timeout: 60_000 }))) {
		log.error('No internet access detected. Skipping application log uploads.')
		return
	}

	// Upload all application logs
	for (const application of config.applications) {
		await uploadApplicationLogs(application)
	}
}
