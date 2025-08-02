import { itsupConfig } from './src/lib/config'

export default itsupConfig({
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
