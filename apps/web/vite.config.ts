import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from 'unocss/vite';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { isolationHeaders } from './src/lib/cross-origin-isolation.ts';
import { migrationsPlugin } from './src/lib/migrations-plugin.ts';
import { pagesRedirects } from './src/pages-redirects.ts';

// Vite's `server.headers` and `preview.headers` skip the responses SvelteKit serves, deep paths included.
const sendIsolationHeaders: Connect.NextHandleFunction = (_request, response, next) => {
	for (const [name, value] of Object.entries(isolationHeaders)) response.setHeader(name, value);
	next();
};

const crossOriginIsolation: Plugin = {
	name: 'cross-origin-isolation',
	configureServer: (server) => void server.middlewares.use(sendIsolationHeaders),
	configurePreviewServer: (server) => void server.middlewares.use(sendIsolationHeaders)
};

const migrations = () => migrationsPlugin(fileURLToPath(new URL('drizzle', import.meta.url)));

export default defineConfig({
	plugins: [crossOriginIsolation, UnoCSS(), sveltekit(), migrations(), pagesRedirects()],
	// Pre-bundling breaks PGlite's relative URLs to its WebAssembly and data files, and Sätteri's URL to its thread
	// worker.
	optimizeDeps: { exclude: ['@electric-sql/pglite', 'satteri'] },
	worker: { format: 'es', plugins: () => [migrations()] },
	test: { include: ['src/**/*.{test,spec}.ts'] }
});
