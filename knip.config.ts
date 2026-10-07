import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreBinaries: [
		'defaults', // Mac native
		'launchctl', // Mac native
		'unzip', // Mac native
		'ping', // Mac native
		'uv', // Python package and project manager
	],
})
