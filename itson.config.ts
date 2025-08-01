export default {
	applications: [
		{
			command: '/Applications/AllWork.app/Contents/MacOS/AllWork',
			name: 'AllWork',
			updates: {
				destination: '/Applications/AllWork.app',
				namePattern: /^AllWork.+\.zip$/,
				owner: 'kitschpatrol',
				repo: 'allwork',
				type: 'github',
			},
		},
	],
	runOnStartup: true,
}
