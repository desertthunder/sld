import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderSlide } from '#lib/slide-render.ts';

const lines = (...rows: string[]) => rows.join('\n');

describe('code blocks', () => {
	it('mark each line, the highlighted ones, and the tokens by kind, with no color of their own', async () => {
		const { html } = await renderSlide(lines('```ts {2}', 'let a = 1;', 'a += "b";', '```'));
		expect(html).toBe(
			lines(
				'<pre class="code-block has-highlights" data-language="ts" data-label="TypeScript"><code><span class="line"><span class="line-code" data-label="TypeScript"><span class="code-keyword">let</span> a = <span class="code-constant">1</span>;</span></span>',
				'<span class="line highlighted">a += <span class="code-string">"b"</span>;</span></code></pre>',
				''
			)
		);
		expect(html).not.toMatch(/style=|#[\da-f]{3,8}\b|color/i);
	});

	it('number lines when the deck asks, in one gutter whatever the line count', async () => {
		const code = lines('```', ...Array.from({ length: 10 }, (_, index) => `line ${index + 1}`), '```');
		const { html } = await renderSlide(code, { lineNumbers: true });
		expect(html).toMatch(/^<pre class="code-block line-numbers"><code><span class="line">line 1<\/span>/);
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		expect(css).toMatch(/pre\.code-block \{[^}]*\t--number-gutter: 2\.6em;[^}]*\t--number-gap: 30px;/);
		expect(css).toMatch(
			/line-numbers \.line \{[^}]*\tpadding-left: calc\(var\(--code-inline\) - var\(--band-inset\) \+ var\(--number-gutter\)\);/
		);
		expect(css).toMatch(/line-numbers \.line::before \{[^}]*\tright: calc\(100% - [^}]*\ttext-align: right;/);
		expect(css).not.toContain('--line-digits');
		const plain = await renderSlide(code);
		expect(plain.html).toMatch(/^<pre class="code-block"><code>/);
	});

	it('show a language there is no grammar for as plain text, keeping its label', async () => {
		const { html } = await renderSlide(lines('```klingon {1}', "Qapla'! <b>", '', '```'));
		expect(html).toBe(
			lines(
				'<pre class="code-block has-highlights" data-language="klingon" data-label="klingon"><code><span class="line highlighted"><span class="line-code" data-label="klingon">Qapla\'! &lt;b&gt;</span></span>',
				'<span class="line"></span></code></pre>',
				''
			)
		);
	});

	it('label a block with its language as escaped text, never markup', async () => {
		const { html } = await renderSlide(lines('```<b>"x"', 'a', '```'));
		expect(html).toBe(
			'<pre class="code-block" data-language="<b>&quot;x&quot;" data-label="<b>&quot;x&quot;"><code><span class="line"><span class="line-code" data-label="<b>&quot;x&quot;">a</span></span></code></pre>\n'
		);
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		expect(css).toMatch(
			/\[data-label\]::before \{[^}]*\tcontent: attr\(data-label\);[^}]*\tcolor: var\(--muted\);[^}]*\tfont-family: 'Mona Sans Variable'/
		);
		expect(css).toMatch(
			/\[data-label\]::before \{[^}]*\ttop: 19px;\n\tright: var\(--label-right\);[^}]*\tfont-size: 20px;[^}]*\tfont-weight: 500;\n\tletter-spacing: 0\.02em;/
		);
	});

	it('keep code on the first line short of the label, which stays where it is and paints above a band', () => {
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		expect(css).toMatch(/pre\.code-block \{[^}]*\t--label-right: 24px;\n\t--label-gap: 24px;/);
		expect(css).toMatch(/\.line:has\(> \.line-code\) \{\n\theight: 1\.5em;\n\theight: 1lh;\n\toverflow: hidden;/);
		expect(css).toMatch(/\.line-code \{\n\twhite-space: pre-wrap;\n\tline-break: anywhere;/);
		const declarations = /\t(content|font-[a-z]+|letter-spacing|line-height): ([^;]+);/g;
		const label = (selector: string) => {
			const start = css.indexOf(selector + ' {');
			const body = css.slice(start, css.indexOf('}', start));
			return Object.fromEntries(body.matchAll(declarations).map(([, name, value]) => [name, value]));
		};
		const visible = label('.slide pre.code-block[data-label]::before');
		expect(visible).toHaveProperty('content', 'attr(data-label)');
		expect(label('.slide pre.code-block .line-code::before')).toEqual(visible);
		expect(css).toMatch(
			/\.line-code::before \{[^}]*\tfloat: right;\n\tvisibility: hidden;\n\tmargin-inline: var\(--label-gap\) calc\(var\(--label-right\) - var\(--code-inline\)\);/
		);
		expect(css).toMatch(/\[data-label\]::before \{[^}]*\tright: var\(--label-right\);\n\tz-index: 1;/);
	});

	// Both engines put a line break after a grid, flex or block box when they copy a selection, so a labeled first line
	// copied with one more break than the source had.
	it('copy a labeled block as its source, with no box on a line that would add a line break', async () => {
		const source = ['const a = 1;', '\tlet b = "<b>";', '', 'a += 2;'];
		for (const lineNumbers of [false, true]) {
			const { html } = await renderSlide(lines('```ts {1}', ...source, '```'), { lineNumbers });
			const code = /<code>(.*)<\/code>/s.exec(html)?.[1] ?? '';
			const text = code
				.replaceAll(/<[^>]+>/g, '')
				.replaceAll('&lt;', '<')
				.replaceAll('&gt;', '>')
				.replaceAll('&quot;', '"')
				.replaceAll('&amp;', '&');
			expect(text).toBe(lines(...source));
			expect(code).toMatch(/^<span class="line highlighted"><span class="line-code" data-label="TypeScript">/);
		}
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		const lineRules = css.matchAll(/([^{}]*\.line[^{}]*)\{([^}]*)\}/g).toArray();
		expect(lineRules.length).toBeGreaterThan(0);
		for (const [, selector, body] of lineRules) {
			if (selector.includes('::')) continue;
			const display = /\tdisplay: ([^;]+);/.exec(body)?.[1];
			expect([undefined, 'inline-block'], selector.trim()).toContain(display);
		}
	});

	it('dim no line when the fence highlights only lines past the end', async () => {
		const { html } = await renderSlide(lines('```ts {9}', 'let a;', 'let b;', '```'));
		expect(html).toMatch(/^<pre class="code-block" data-language="ts" data-label="TypeScript">/);
		expect(html).not.toContain('highlighted');
	});

	it('read line ranges written against the language', async () => {
		const { html } = await renderSlide(lines('```ts{2} title="a.ts"', 'let a;', 'let b;', '```'));
		expect(html).toMatch(
			/^<pre class="code-block has-highlights" data-language="ts" data-label="TypeScript"><code><span class="line"><span class="line-code" data-label="TypeScript"><span class="code-keyword">let<\/span>/
		);
		expect(html).toContain('<span class="line highlighted"><span class="code-keyword">let</span> b;</span>');
		const bare = await renderSlide(lines('```{1}', 'plain', '```'));
		expect(bare.html).toBe(
			'<pre class="code-block has-highlights"><code><span class="line highlighted">plain</span></code></pre>\n'
		);
	});

	it('give an empty line the height of a line, so a blank line in code never collapses', () => {
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		expect(css).toMatch(/\.line \{[^}]*\tdisplay: inline-block;[^}]*\tmin-height: 1lh;[^}]*\tvertical-align: top;/);
	});

	it('keep a gap above and below a block, band highlighted lines inset with rounded ends, and number lines in the comment color', () => {
		const css = readFileSync(new URL('code-block.css', import.meta.url), 'utf8');
		expect(css).toMatch(/pre\.code-block \{[^}]*\tmargin: 46px 0;/);
		expect(css).toMatch(/\.line \{[^}]*\tborder-radius: 6px;/);
		expect(css).toMatch(/pre\.code-block \{[^}]*\t--code-inline: 44px;/);
		expect(css).toMatch(/pre\.code-block \{[^}]*\t--band-inset: 23px;/);
		expect(css).toMatch(
			/\.line\.highlighted \{\n\tbackground: color-mix\(in oklab, var\(--base02\) 70%, var\(--base01\)\);/
		);
		expect(css).toMatch(/\.line::before \{[^}]*\tcolor: var\(--code-comment\);/);
	});

	it('show an indented block as plain text', async () => {
		const { html } = await renderSlide('    indented');
		expect(html).toBe('<pre class="code-block"><code><span class="line">indented</span></code></pre>\n');
	});

	it('load no highlighter or grammar for a slide whose code blocks name no language Shiki knows', async () => {
		vi.resetModules();
		const loads = vi.fn();
		vi.doMock('#lib/code-highlight.ts', () => {
			loads();
			return { highlightCode: () => Promise.resolve() };
		});
		try {
			const fresh = await import('#lib/slide-render.ts');
			await fresh.renderSlide(
				lines(
					'# No code',
					'',
					'Just `inline` code.',
					'',
					'    indented',
					'',
					'```',
					'plain',
					'```',
					'',
					'```text',
					'plain',
					'```',
					'',
					'```klingon',
					"Qapla'!",
					'```'
				)
			);
			expect(loads).not.toHaveBeenCalled();
			await fresh.renderSlide(lines('```ts', 'let a;', '```'));
			expect(loads).toHaveBeenCalledOnce();
		} finally {
			vi.doUnmock('#lib/code-highlight.ts');
		}
	});

	it('show code as plain text when its grammar fails to download', async () => {
		vi.resetModules();
		vi.doMock('#lib/code-highlight.ts', () => ({
			highlightCode: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
		}));
		try {
			const fresh = await import('#lib/slide-render.ts');
			const { html } = await fresh.renderSlide(lines('```ts {1}', 'let a;', '```'));
			expect(html).toBe(
				'<pre class="code-block has-highlights" data-language="ts" data-label="TypeScript"><code><span class="line highlighted"><span class="line-code" data-label="TypeScript">let a;</span></span></code></pre>\n'
			);
		} finally {
			vi.doUnmock('#lib/code-highlight.ts');
		}
	});
});
