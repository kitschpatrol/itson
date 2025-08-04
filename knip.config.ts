import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['itson.config.ts', 'src/lib/commands/start.ts', 'src/lib/commands/stop.ts'],
	ignoreBinaries: [
		'defaults', // Mac native
		'launchctl', // Mac native
		'unzip', // Mac native
		'ping', // Mac native
		'uv', // Python package and project manager
	],
})
