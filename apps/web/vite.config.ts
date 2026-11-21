import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Pre-bundling breaks PGlite's relative URLs to its WebAssembly and data files.
	optimizeDeps: { exclude: ['@electric-sql/pglite'] },
	worker: { format: 'es' },
	test: { include: ['src/**/*.{test,spec}.ts'] }
});
