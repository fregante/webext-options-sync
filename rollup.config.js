import typescript from 'rollup-plugin-typescript';

export default {
	input: 'source/index.ts',
	output: {
		banner: '// https://github.com/bfred-it/webext-options-sync',
		file: 'webext-options-sync.js',
		format: 'iife',

		// Add globals to `window`
		name: 'window',
		extend: true
	},
	plugins: [
		typescript()
	]
};
