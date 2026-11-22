import { describe, expect, it } from 'vitest';
import { plainInline, plainInlineLimit } from '#lib/inline-text.ts';

describe('plainInline', () => {
	it.each([
		['strong emphasis', '**Bold** title', 'Bold title'],
		['a code span', 'Using `code`', 'Using code'],
		['a code span holding markup', 'Run `**not bold**` and `a_b`', 'Run **not bold** and a_b'],
		['a code span with padding', '`` `ticks` ``', '`ticks`'],
		['a link', '[Link](https://x)', 'Link'],
		['a link holding emphasis', '[**Docs**](https://x) here', 'Docs here'],
		['a reference link', '[Guide][guide] page', 'Guide page'],
		['an image', '![Logo](logo.png) Inc', 'Logo Inc'],
		['an autolink', 'See <https://x.dev/a_b_c>', 'See https://x.dev/a_b_c'],
		['underscore and star emphasis', '_a_ and *b*', 'a and b'],
		['nested emphasis', '***very*** **_much_** so', 'very much so'],
		['strikethrough', '~~old~~ new', 'old new'],
		['escaped characters', String.raw`\*not em\* and \# and \\`, '*not em* and # and \\'],
		['escaped brackets', String.raw`\[not a link\](x)`, '[not a link](x)'],
		['inline HTML tags', 'Hello <em>there</em><br/> <span class="x">you</span>', 'Hello there you'],
		['an HTML comment', 'Visible <!-- hidden --> text', 'Visible text']
	])('strips %s', (_case, markdown, text) => {
		expect(plainInline(markdown)).toBe(text);
	});

	it.each([
		['intra-word underscores', 'my_file_name.ts'],
		['snake case words', 'use snake_case_names here'],
		['a lone star between spaces', '2 * 3 = 6'],
		['an unmatched star', '5*3'],
		['an unclosed code span', 'a `b'],
		['a backslash before a letter', String.raw`C:\path`],
		['a comparison', 'a < b > c']
	])('keeps %s', (_case, markdown) => {
		expect(plainInline(markdown)).toBe(markdown);
	});

	it('leaves nothing of markup alone', () => {
		expect(plainInline('** **')).toBe('** **');
		expect(plainInline('<br>')).toBe('');
	});

	it(`reads at most ${plainInlineLimit} characters`, () => {
		expect(plainInline('a'.repeat(500))).toBe('a'.repeat(plainInlineLimit));
	});

	it('stays fast on a long line of open delimiters', () => {
		const line = '`'.repeat(10_000) + '*_~['.repeat(50_000) + '<'.repeat(10_000);
		const start = performance.now();
		plainInline(line);
		expect(performance.now() - start).toBeLessThan(100);
	});
});
