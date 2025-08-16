import { consola } from 'consola'
import type { ItsonConfig, ItsonConfigApplication } from '../config'
import { S3FolderSync } from '../log-uploader'

/**
 * Upload the logs for a single application
 * @public
 */
export async function uploadApplicationLogs(application: ItsonConfigApplication) {
	if (!application.logUpload) {
		consola.info(`No log upload strategy found for ${application.name}, skipping...`)
		return
	}

	// eslint-disable-next-line ts/no-unnecessary-condition
	if (application.logUpload.type !== 's3') {
		// eslint-disable-next-line ts/restrict-template-expressions
		consola.error(`Unsupported log upload type: ${application.logUpload.type}`)
		return
	}

	consola.info(
		`Uploading logs for ${application.name} from ${application.logUpload.localPath} to ${application.logUpload.bucketName}/${application.logUpload.remotePath}`,
	)

	const applicationLogUploader = new S3FolderSync(application.logUpload)
	try {
		await applicationLogUploader.sync()
	} catch (error) {
		consola.error(`Error uploading logs for ${application.name}: ${String(error)}`)
	}

	consola.success(`Logs uploaded for ${application.name}`)
}

/**
 * Upload all application logs
 */
export async function uploadAllApplicationLogs(config: ItsonConfig) {
	consola.info('Uploading all application logs')

	// Upload all application logs
	for (const application of config.applications) {
		await uploadApplicationLogs(application)
	}
}
