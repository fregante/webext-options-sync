import typescript from '@rollup/plugin-typescript';
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
		})
	]
};
