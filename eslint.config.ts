import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		ts: {
			overrides: {
				'depend/ban-dependencies': [
					'error',
					{
						allowed: ['execa'],
					},
				],
			},
		},
		type: 'lib',
	},
	{
		files: ['readme.md/*.js'],
		rules: {
			'perfectionist/sort-objects': 'off',
		},
	},
)
