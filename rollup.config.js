import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

const config = {
	input: 'index.ts',
	output: {
		format: 'esm',
		dir: '.',
	},
	external: [
		// These are `type: module` packages so they don't need to be bundled
		'webext-detect-page',
		'dom-form-serializer/dist/dom-form-serializer.mjs',
		'throttle-debounce',
	],
	plugins: [
		resolve(),
		commonjs(),
		typescript({
			outDir: '.',
		}),
	],
};

export default config;
