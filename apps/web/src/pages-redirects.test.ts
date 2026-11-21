import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRewrites, rewriteTarget } from './pages-redirects.ts';

describe('parseRewrites', () => {
	it('keeps only rules with status 200', () => {
		const text = '# comment\n\n/old /new 301\n/app/*   /app.html 200\n/docs /docs.html\n';
		expect(parseRewrites(text)).toEqual([{ from: '/app/*', to: '/app.html' }]);
	});
});

describe('rewriteTarget', () => {
	const rewrites = parseRewrites(readFileSync(new URL('../static/_redirects', import.meta.url), 'utf8'));

	it('serves the app shell for every path under /app', () => {
		expect(rewriteTarget(rewrites, '/app/')).toBe('/app.html');
		expect(rewriteTarget(rewrites, '/app/deck/x')).toBe('/app.html');
	});

	it('leaves the landing page, /app itself and assets alone', () => {
		expect(rewriteTarget(rewrites, '/')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/app')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/application')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/_app/immutable/entry/start.js')).toBeUndefined();
	});
});
