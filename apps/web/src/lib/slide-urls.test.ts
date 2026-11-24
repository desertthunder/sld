import { describe, expect, it } from 'vitest';
import { renderSlide } from '#lib/slide-render.ts';
import { isAllowedUrl, urlScheme } from '#lib/slide-urls.ts';

const png =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('urlScheme', () => {
	it('reads a scheme the way a browser does', () => {
		expect(urlScheme('https://example.com')).toBe('https');
		expect(urlScheme('JavaScript:alert(1)')).toBe('javascript');
		expect(urlScheme(' \u{1}javascript:alert(1)\0 ')).toBe('javascript');
		expect(urlScheme('java\tscr\nipt\r:alert(1)')).toBe('javascript');
	});

	it('finds no scheme in a relative URL', () => {
		for (const url of [
			'',
			'slides/one.png',
			'/deck',
			'#notes',
			'?q=1',
			'./a:b',
			'1http:x',
			'java%09script:alert(1)'
		]) {
			expect(urlScheme(url)).toBeUndefined();
		}
	});
});

describe('isAllowedUrl', () => {
	it('refuses script URLs in links and images, however they are written', () => {
		const urls = [
			'javascript:alert(1)',
			'JAVASCRIPT:alert(1)',
			'vbscript:msgbox(1)',
			'VBScript:msgbox(1)',
			'  javascript:alert(1)',
			'\0\u{1F}javascript:alert(1)',
			'java\tscript:alert(1)',
			'java\nscript:alert(1)',
			'j\r\na\tv\tascript:alert(1)',
			'javascript:alert(1)\n'
		];
		for (const url of urls) {
			expect(isAllowedUrl(url, 'link'), url).toBe(false);
			expect(isAllowedUrl(url, 'image'), url).toBe(false);
		}
	});

	it('refuses every data URL in a link', () => {
		for (const url of ['data:text/html,<script>alert(1)</script>', png, 'DATA:image/gif;base64,R0lG', 'data:,hi']) {
			expect(isAllowedUrl(url, 'link'), url).toBe(false);
		}
	});

	it('keeps PNG, JPEG, GIF, WebP and AVIF data URLs in an image and refuses the rest', () => {
		for (const type of ['png', 'jpeg', 'gif', 'webp', 'avif']) {
			expect(isAllowedUrl(`data:image/${type};base64,AAAA`, 'image'), type).toBe(true);
		}
		expect(isAllowedUrl('DATA:Image/PNG;base64,AAAA', 'image')).toBe(true);
		expect(isAllowedUrl('data:image/png,raw', 'image')).toBe(true);
		expect(isAllowedUrl(' data:image/png \n', 'image')).toBe(true);
		const refused = [
			'data:image/svg+xml,<svg onload="alert(1)"/>',
			'data:image/svg+xml;base64,PHN2Zz4=',
			'data:text/html,<script>alert(1)</script>',
			'data:image/pngx;base64,AAAA',
			'data:image/jpg;base64,AAAA',
			'data:image/bmp;base64,AAAA',
			'data:image/x-icon;base64,AAAA',
			'data:,AAAA',
			'data:text/javascript,alert(1)'
		];
		for (const url of refused) expect(isAllowedUrl(url, 'image'), url).toBe(false);
	});

	it('keeps ordinary and relative URLs', () => {
		for (const url of [
			'https://example.com/a?b#c',
			'https://example.com',
			'mailto:someone@example.com',
			'tel:+15555550100',
			'slides/one.png',
			'/a',
			'#heading',
			''
		]) {
			expect(isAllowedUrl(url, 'link'), url).toBe(true);
			expect(isAllowedUrl(url, 'image'), url).toBe(true);
		}
	});
});

async function render(markdown: string): Promise<string> {
	const { html } = await renderSlide(markdown);
	return html.trim();
}

describe('safe URLs in a rendered slide', () => {
	it('shows a link with a script URL as its text', async () => {
		expect(await render('[click **me**](javascript:alert(1))')).toBe('<p>click <strong>me</strong></p>');
		expect(await render('[x](VBSCRIPT:msgbox(1))')).toBe('<p>x</p>');
		expect(await render('<javascript:alert(1)>')).toBe('<p>javascript:alert(1)</p>');
	});

	it('drops script URLs written with entities or in a reference, and keeps what a browser reads as relative', async () => {
		// Sätteri percent-encodes a decoded space, tab or newline, which a browser then reads as part of a relative path.
		expect(await render('[x](java&#x09;script:alert(1))')).toBe('<p><a href="java%09script:alert(1)">x</a></p>');
		expect(await render('[x](<java&#x0A;script:alert(1)>)')).toBe('<p><a href="java%0Ascript:alert(1)">x</a></p>');
		expect(await render('[x](&#x20;javascript:alert(1))')).toBe('<p><a href="%20javascript:alert(1)">x</a></p>');
		expect(await render('[x](&#106;avascript:alert(1))')).toBe('<p>x</p>');
		expect(await render('[x][ref]\n\n[ref]: JavaScript:alert(1)')).toBe('<p>x</p>');
		expect(await render('![shot][img]\n\n[img]: javascript:alert(1)')).toBe('<p>shot</p>');
	});

	it('shows an image with a refused URL as its alt text, or nothing', async () => {
		expect(await render('![a chart](javascript:alert(1))')).toBe('<p>a chart</p>');
		expect(await render('![](javascript:alert(1))')).toBe('<p></p>');
		expect(await render('![logo](data:image/svg+xml,%3Csvg%20onload=alert(1)%3E)')).toBe('<p>logo</p>');
	});

	it('shows a link with a data URL as its text', async () => {
		expect(await render('[x](data:text/html,<script>alert(1)</script>)')).toBe('<p>x</p>');
	});

	it('keeps a raster data image', async () => {
		expect(await render(`![dot](${png})`)).toBe(`<p class="lone-image"><img src="${png}" alt="dot"></p>`);
	});

	it('checks an image inside a link and the link apart', async () => {
		expect(await render(`[![dot](${png})](javascript:alert(1))`)).toBe(
			`<p class="lone-image"><img src="${png}" alt="dot"></p>`
		);
		expect(await render('[![x](javascript:alert(1))](https://example.com)')).toBe(
			'<p><a href="https://example.com">x</a></p>'
		);
	});

	it('keeps ordinary links and images', async () => {
		expect(await render('[a](https://example.com) [b](mailto:a@example.com) [c](notes.md) ![d](pic.png)')).toBe(
			'<p><a href="https://example.com">a</a> <a href="mailto:a@example.com">b</a> <a href="notes.md">c</a> <img src="pic.png" alt="d"></p>'
		);
	});

	it('leaves raw HTML as the person typed it', async () => {
		expect(await render('<a href="javascript:alert(1)">raw</a>')).toBe(
			'<p><a href="javascript:alert(1)">raw</a></p>'
		);
		expect(await render('<img src="javascript:alert(1)">')).toBe('<img src="javascript:alert(1)">');
	});
});
