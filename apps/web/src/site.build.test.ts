import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isolationHeaders } from '#lib/cross-origin-isolation.ts';
import { parseRewrites } from './pages-redirects.ts';
import { headersFor, pagesAnswer, parseHeaderRules } from './pages-site.ts';

// Runs against `apps/web/build`, so build first: `pnpm --filter @sld/web build`.
const build = new URL('../build/', import.meta.url);
const files = new Set(
	readdirSync(build, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path.relative(fileURLToPath(build), path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')
		)
);
const read = (file: string) => readFileSync(new URL(file, build), 'utf8');
const rewrites = parseRewrites(read('_redirects'));
const headerRules = parseHeaderRules(read('_headers'));
const ruleLines = (text: string) =>
	text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'));

describe('the build on Cloudflare Pages', () => {
	// The model below reads only these forms, so any other rule could change what Pages answers unseen.
	it('holds only rules the model reads: 200 rewrites, and header rules with no placeholder or detach', () => {
		expect(rewrites).toHaveLength(ruleLines(read('_redirects')).length);
		for (const { pattern, headers } of headerRules) {
			expect(pattern, pattern).toMatch(/^\/[^:]*$/);
			for (const name of Object.keys(headers)) expect(name, name).not.toMatch(/^!/);
		}
	});

	it('serves the landing page at / and the app shell at /app and every path under it', () => {
		expect(pagesAnswer(files, rewrites, '/')).toEqual({ status: 200, file: 'index.html' });
		for (const pathname of ['/app', '/app/', '/app/settings', '/app/deck/x', '/app/deck/x/present', '/app/a/b/c/d'])
			expect(pagesAnswer(files, rewrites, pathname), pathname).toEqual({ status: 200, file: 'app.html' });
	});

	it('answers every other path with no file with 404.html and status 404', () => {
		for (const pathname of [
			'/nope',
			'/nope/',
			'/nope/deeper/still',
			'/application',
			'/apps/deck/x',
			'/_app',
			'/_app/'
		])
			expect(pagesAnswer(files, rewrites, pathname), pathname).toEqual({ status: 404, file: '404.html' });
	});

	it('makes every path cross-origin isolated, unknown ones included', () => {
		for (const pathname of ['/', '/app', '/app/deck/x', '/nope', '/nope/deeper', '/404'])
			expect(headersFor(headerRules, pathname), pathname).toMatchObject(isolationHeaders);
	});
});

describe('404.html', () => {
	const page = read('404.html');
	const links = page
		.matchAll(/<a\b([^>]*)>/g)
		.map(([, attributes]) => attributes)
		.toArray();

	it('says the page is not found', () => {
		expect(page).toMatch(/<h1[^>]*>Page not found<\/h1>/);
		expect(page).toContain('<title>Page not found · sld</title>');
	});

	it('links to the landing page and the app', () => {
		expect(links.some((attributes) => attributes.includes('href="/"'))).toBe(true);
		expect(links.some((attributes) => attributes.includes('href="/app"'))).toBe(true);
	});

	it('links to the repository in a new tab, with a name for its icon', () => {
		const github = links.find((attributes) => attributes.includes('href="https://github.com/desertthunder/sld"'));
		expect(github).toContain('target="_blank"');
		expect(github).toMatch(/rel="[^"]*\bnoopener\b/);
		expect(github).toContain('aria-label="sld on GitHub"');
	});

	it('loads its files from absolute paths, since Pages serves it at any depth', () => {
		expect(page).not.toMatch(/(?:href|src)="(?!\/|https:|#)/);
	});

	it('carries no script', () => {
		expect(page).not.toMatch(/<script\b/);
	});
});
