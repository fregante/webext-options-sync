import globals from 'globals';

/**
@type {import('xo').FlatXoConfig}
*/
const xoConfig = [
	{
		languageOptions: {
			globals: {
				...globals.browser,
				chrome: 'readonly',
			},
		},
		rules: {
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-dynamic-delete': 'off',
			'@typescript-eslint/no-empty-function': 'off',
		},
	},
	{
		files: ['package.json'],
		rules: {
			// `@types/wicg-file-system-access` only provides globals, there's no package to import
			'package-json/no-orphan-types': 'off',
		},
	},
	{
		// The test environment sets up the `chrome` and `location` globals
		files: ['test/_env.js'],
		rules: {
			'unicorn/no-global-object-property-assignment': 'off',
		},
	},
];

export default xoConfig;
