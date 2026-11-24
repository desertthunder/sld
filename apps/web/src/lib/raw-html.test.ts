import { describe, expect, it } from 'vitest';
import { findRawHtml } from '#lib/imported-html.ts';
import { cleanRawHtml, type HtmlVerdict } from '#lib/raw-html.ts';

// A stand-in for DOMPurify: scripts and `on…` attributes are unsafe, and the safe form leaves them out.
function check(html: string): HtmlVerdict {
	const replacement = html.replaceAll(/<script>[^]*?<\/script>|<\/?script>/g, '').replaceAll(/\s+on\w+="[^"]*"/g, '');
	return replacement === html ? { isSafe: true } : { isSafe: false, replacement };
}

// A check that finds a `<video>` left open unsafe, as DOMPurify's check does.
function closesVideo(html: string): HtmlVerdict {
	const isOpen = html.split('<video').length > html.split('</video>').length;
	return isOpen ? { isSafe: false, replacement: '' } : { isSafe: true };
}

// A check whose replacements stay unsafe.
function stubborn(html: string): HtmlVerdict {
	return html.includes('onclick') ? { isSafe: false, replacement: html } : { isSafe: true };
}

// A parser that reads the whole slide as raw HTML, even once escaped, and a check that never passes it.
const wholeSlide = (markdown: string) => [{ start: 0, end: markdown.length, value: markdown }];
const neverSafe = (): HtmlVerdict => ({ isSafe: false, replacement: '<b>' });

const clean = (slide: string) => cleanRawHtml(slide, { find: findRawHtml, check });
const lines = (...rows: string[]) => rows.join('\n');

describe('findRawHtml', () => {
	it('finds block and inline HTML with where its source sits', () => {
		const markdown = lines('<div class="a">', '', 'Text <b>bold</b> and <br>');
		expect(findRawHtml(markdown)).toEqual([
			{ start: 0, end: 15, value: '<div class="a">' },
			{
				start: 22,
				end: 42,
				value: '<b>bold</b> and <br>',
				parts: [
					{ start: 22, end: 25, value: '<b>' },
					{ start: 29, end: 33, value: '</b>' },
					{ start: 38, end: 42, value: '<br>' }
				]
			}
		]);
	});

	it('finds inline HTML with text between as one run, with the text as HTML writes it', () => {
		const markdown = lines('A <b>x & y</b> *and* <i>z</i>', '', '<div>', '<p>');
		expect(findRawHtml(markdown).map(({ value, parts }) => ({ value, parts: parts?.length }))).toEqual([
			{ value: '<b>x &amp; y</b>', parts: 2 },
			{ value: '<i>z</i>', parts: 2 },
			{ value: lines('<div>', '<p>'), parts: undefined }
		]);
	});

	it('counts offsets in UTF-16 code units, as JavaScript strings do', () => {
		const markdown = 'é😀 <i>x</i>';
		expect(findRawHtml(markdown).map(({ start, end }) => markdown.slice(start, end))).toEqual(['<i>x</i>']);
	});

	it('finds no HTML in code spans, fenced code or indented code', () => {
		expect(findRawHtml(lines('`<script>`', '', '```html', '<script>x()</script>', '```', '', '    <b>'))).toEqual(
			[]
		);
	});
});

describe('cleanRawHtml', () => {
	it('leaves a slide whose HTML is safe byte for byte', () => {
		const slide = lines('# Title', '', '<div class=cols>', '', '**x**', '', '</div>', '', 'A <br/> break');
		expect(clean(slide)).toBe(slide);
	});

	it('replaces unsafe block and inline HTML and nothing around it', () => {
		const slide = lines('<script>steal()</script>', '', 'Look <img src="x" onerror="steal()"> here', '');
		expect(clean(slide)).toBe(lines('', '', 'Look <img src="x"> here', ''));
	});

	it('keeps code that shows a script as text', () => {
		const slide = lines('Write `<script>` like this:', '', '```html', '<script>alert(1)</script>', '```');
		expect(clean(slide)).toBe(slide);
	});

	it('leaves the slide frontmatter alone', () => {
		const slide = lines('---', 'notes: <b onclick="x">hi</b>', '---', '', '<p onclick="y">Hi</p>');
		expect(clean(slide)).toBe(lines('---', 'notes: <b onclick="x">hi</b>', '---', '', '<p>Hi</p>'));
	});

	it('keeps inline HTML that is only safe as a whole, such as an element its next node closes', () => {
		const slide = 'Watch <video src="a.mp4" controls></video> now';
		expect(cleanRawHtml(slide, { find: findRawHtml, check: closesVideo })).toBe(slide);
	});

	it('checks each node of an unsafe run on its own', () => {
		expect(clean('A <b onclick="x">b</b> and <i>c</i>')).toBe('A <b>b</b> and <i>c</i>');
	});

	it('keeps the blockquote markers on each line of a replaced node', () => {
		const slide = lines('> <div onclick="x">', '> <p>hi</p>', '> </div>');
		expect(clean(slide)).toBe(lines('> <div>', '> <p>hi</p>', '> </div>'));
	});

	it('escapes HTML into text when replacing it never makes it safe', () => {
		const slide = 'A <b onclick="x">b</b>';
		expect(cleanRawHtml(slide, { find: findRawHtml, check: stubborn })).toBe('A &lt;b onclick="x">b</b>');
	});

	it('throws when the HTML is still unsafe after every pass', () => {
		expect(() => cleanRawHtml('<b>', { find: wholeSlide, check: neverSafe })).toThrow(
			"The slide's HTML couldn't be made safe"
		);
	});
});
