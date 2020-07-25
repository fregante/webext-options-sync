import typescript from '@rollup/plugin-typescript';
import {terser} from 'rollup-plugin-terser';
import commonjs from '@rollup/plugin-commonjs';

export default ['cjs', 'esm'].map(format => ({
	input: 'index.ts',
	output: {
		format,
		dir: format
	},
	plugins: [
		commonjs(),
		typescript({
			outDir: format
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
}));
