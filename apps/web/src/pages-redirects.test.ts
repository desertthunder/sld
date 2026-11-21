import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assetFile, parseRewrites, rewriteTarget } from './pages-redirects.ts';

describe('parseRewrites', () => {
	it('keeps only rules with status 200', () => {
		const text = '# comment\n\n/old /new 301\n/app/*   /app.html 200\n/docs /docs.html\n';
		expect(parseRewrites(text)).toEqual([{ from: '/app/*', to: '/app.html' }]);
	});
});

describe('rewriteTarget', () => {
	const rewrites = parseRewrites(readFileSync(new URL('../static/_redirects', import.meta.url), 'utf8'));

	it('serves the app shell for every path under /app', () => {
		expect(assetFile(rewriteTarget(rewrites, '/app/') ?? '')).toBe('/app.html');
		expect(assetFile(rewriteTarget(rewrites, '/app/deck/x') ?? '')).toBe('/app.html');
	});

	it('rewrites to the pretty URL, since Pages redirects a .html target and drops the path', () => {
		expect(rewriteTarget(rewrites, '/app/deck/x')).toBe('/app');
	});

	it('leaves the landing page, /app itself and assets alone', () => {
		expect(rewriteTarget(rewrites, '/')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/app')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/application')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/_app/immutable/entry/start.js')).toBeUndefined();
	});
});

describe('assetFile', () => {
	it('adds .html to a pretty URL and leaves a file name alone', () => {
		expect(assetFile('/app')).toBe('/app.html');
		expect(assetFile('/app.html')).toBe('/app.html');
		expect(assetFile('/_app/version.json')).toBe('/_app/version.json');
	});
});
