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
		files: ['readme.md/*.js', 'readme.md/*.ts'],
		rules: {
			'perfectionist/sort-objects': 'off',
			'require-unicode-regexp': 'off',
			'ts/consistent-type-imports': 'off',
		},
	},
)
