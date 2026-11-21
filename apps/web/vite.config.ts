import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { migrationsPlugin } from './src/lib/migrations-plugin.ts';
import { pagesRedirects } from './src/pages-redirects.ts';

const migrations = () => migrationsPlugin(fileURLToPath(new URL('drizzle', import.meta.url)));

export default defineConfig({
	plugins: [sveltekit(), migrations(), pagesRedirects()],
	// Pre-bundling breaks PGlite's relative URLs to its WebAssembly and data files.
	optimizeDeps: { exclude: ['@electric-sql/pglite'] },
	worker: { format: 'es', plugins: () => [migrations()] },
	test: { include: ['src/**/*.{test,spec}.ts'] }
});
