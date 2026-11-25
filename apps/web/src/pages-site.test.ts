import { describe, expect, it } from 'vitest';
import { parseRewrites } from './pages-redirects.ts';
import { headersFor, pagesAnswer, parseHeaderRules } from './pages-site.ts';

const rewrites = parseRewrites('/app/* /app 200\n');

describe('pagesAnswer', () => {
	const files = new Set(['index.html', 'app.html', '404.html', 'docs/index.html', 'docs/404.html', 'favicon.ico']);

	it('serves files through pretty URLs', () => {
		expect(pagesAnswer(files, rewrites, '/')).toEqual({ status: 200, file: 'index.html' });
		expect(pagesAnswer(files, rewrites, '/app')).toEqual({ status: 200, file: 'app.html' });
		expect(pagesAnswer(files, rewrites, '/docs/')).toEqual({ status: 200, file: 'docs/index.html' });
		expect(pagesAnswer(files, rewrites, '/favicon.ico')).toEqual({ status: 200, file: 'favicon.ico' });
	});

	it('serves a rewrite target with status 200', () => {
		expect(pagesAnswer(files, rewrites, '/app/deck/x/present')).toEqual({ status: 200, file: 'app.html' });
	});

	it('answers a path with no file with the nearest 404.html above it', () => {
		expect(pagesAnswer(files, rewrites, '/nope')).toEqual({ status: 404, file: '404.html' });
		expect(pagesAnswer(files, rewrites, '/nope/deeper')).toEqual({ status: 404, file: '404.html' });
		expect(pagesAnswer(files, rewrites, '/docs/nope')).toEqual({ status: 404, file: 'docs/404.html' });
	});

	it('serves index.html for a path with no file when the build has no top-level 404.html', () => {
		const singlePage = new Set(['index.html', 'docs/404.html']);
		expect(pagesAnswer(singlePage, rewrites, '/nope')).toEqual({ status: 200, file: 'index.html' });
	});
});

describe('headersFor', () => {
	const rules = parseHeaderRules('# comment\n/*\n  A: one\n  B: two: three\n/app/*\n  C: four\n');

	it('reads each pattern and the headers below it', () => {
		expect(rules).toEqual([
			{ pattern: '/*', headers: { A: 'one', B: 'two: three' } },
			{ pattern: '/app/*', headers: { C: 'four' } }
		]);
	});

	it('adds the headers of every matching rule', () => {
		expect(headersFor(rules, '/nope')).toEqual({ A: 'one', B: 'two: three' });
		expect(headersFor(rules, '/app/deck/x')).toEqual({ A: 'one', B: 'two: three', C: 'four' });
		expect(headersFor(rules, '/application')).toEqual({ A: 'one', B: 'two: three' });
	});
});
