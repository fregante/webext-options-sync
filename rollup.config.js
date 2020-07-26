import typescript from '@rollup/plugin-typescript';
import {terser} from 'rollup-plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
	input: 'index.ts',
	output: {
		format: 'esm',
		dir: '.'
	},
	plugins: [
		resolve(),
		commonjs(),
		typescript({
			outDir: '.'
		}),
		terser({
			toplevel: true,
			output: {
				comments: false,
				beautify: true
			},
			mangle: false,
			compress: {
				join_vars: false, // eslint-disable-line camelcase
				booleans: false,
				expression: false,
				sequences: false
			}
		})
	]
};
