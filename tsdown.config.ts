import { defineConfig } from 'tsdown'

export default defineConfig({
	deps: {
		neverBundle: ['@github/keytar'],
	},
	dts: false,
	entry: './src/bin/cli.ts',
	fixedExtension: false,
	minify: true,
	platform: 'node',
	publint: true,
})
