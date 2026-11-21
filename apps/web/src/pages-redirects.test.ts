import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { parseRewrites, rewriteRequests, rewriteTarget } from './pages-redirects.ts';

const rewrites = parseRewrites(readFileSync(new URL('../static/_redirects', import.meta.url), 'utf8'));

describe('parseRewrites', () => {
	it('keeps only rules with status 200', () => {
		const text = '# comment\n\n/old /new 301\n/app/*   /app.html 200\n/docs /docs.html\n';
		expect(parseRewrites(text)).toEqual([{ from: '/app/*', to: '/app.html' }]);
	});
});

describe('rewriteTarget', () => {
	it('rewrites every path under /app to the pretty URL, since Pages redirects a .html target and drops the path', () => {
		expect(rewriteTarget(rewrites, '/app/')).toBe('/app');
		expect(rewriteTarget(rewrites, '/app/deck/x')).toBe('/app');
	});

	it('leaves the landing page, /app itself and assets alone', () => {
		expect(rewriteTarget(rewrites, '/')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/app')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/application')).toBeUndefined();
		expect(rewriteTarget(rewrites, '/_app/immutable/entry/start.js')).toBeUndefined();
	});
});

function handle(method: string, url: string): string | undefined {
	const request = { method, url } as IncomingMessage;
	let wasPassedOn = false;
	rewriteRequests(rewrites)(request, {} as ServerResponse, () => {
		wasPassedOn = true;
	});
	return wasPassedOn ? request.url : undefined;
}

describe('rewriteRequests', () => {
	it('hands a deck path on as /app, so it gets the same response as /app', () => {
		expect(handle('GET', '/app/deck/x?slide=2')).toBe('/app?slide=2');
		expect(handle('HEAD', '/app/')).toBe('/app');
	});

	it('hands every other request on unchanged', () => {
		expect(handle('GET', '/')).toBe('/');
		expect(handle('GET', '/_app/version.json')).toBe('/_app/version.json');
		expect(handle('POST', '/app/deck/x')).toBe('/app/deck/x');
	});
});
