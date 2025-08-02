import { itsonConfig } from './src/lib/config'

export default itsonConfig({
	applications: [
		{
			command: '/Applications/AllWork.app/Contents/MacOS/AllWork',
			name: 'AllWork',
			update: {
				artifactPattern: /^AllWork.+\.zip$/,
				destination: '/Applications/AllWork.app',
				owner: 'kitschpatrol',
				repo: 'allwork',
				type: 'github',
			},
		},
	],
	runOnStartup: true,
})
