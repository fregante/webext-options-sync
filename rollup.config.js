import typescript from '@rollup/plugin-typescript';
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
		})
	]
}));
