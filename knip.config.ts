import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreBinaries: [
		'uv', // Python package and project manager
	],
})
