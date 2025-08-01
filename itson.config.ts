import { itsonConfig } from './src/lib/config'

export default itsonConfig({
	applications: [
		{
			command: '/Applications/AllWork.app/Contents/MacOS/AllWork',
			name: 'AllWork',
			updates: {
				destination: '/Applications/AllWork.app',
				artifactPattern: /^AllWork.+\.zip$/,
				owner: 'kitschpatrol',
				repo: 'allwork',
				type: 'github',
			},
		},
	],
	runOnStartup: true,
})
