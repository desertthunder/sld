import { describe, expect, it, vi } from 'vitest';
import { renderSlide } from '#lib/slide-render.ts';

const lines = (...rows: string[]) => rows.join('\n');

describe('code blocks', () => {
	it('mark each line, the highlighted ones, and the tokens by kind, with no color of their own', async () => {
		const { html } = await renderSlide(lines('```ts {2}', 'let a = 1;', 'a += "b";', '```'));
		expect(html).toBe(
			lines(
				'<pre class="code-block has-highlights" data-language="ts"><code><span class="line"><span class="code-keyword">let</span> a = <span class="code-constant">1</span>;</span>',
				'<span class="line highlighted">a += <span class="code-string">"b"</span>;</span></code></pre>',
				''
			)
		);
		expect(html).not.toMatch(/style=|#[\da-f]{3,8}\b|color/i);
	});

	it('number lines when the deck asks, sized for the widest number', async () => {
		const code = lines('```', ...Array.from({ length: 10 }, (_, index) => `line ${index + 1}`), '```');
		const { html } = await renderSlide(code, { lineNumbers: true });
		expect(html).toMatch(/^<pre class="code-block line-numbers" style="--line-digits: 2"><code>/);
		const plain = await renderSlide(code);
		expect(plain.html).toMatch(/^<pre class="code-block"><code>/);
	});

	it('show a language there is no grammar for as plain text, keeping its label', async () => {
		const { html } = await renderSlide(lines('```klingon {1}', "Qapla'! <b>", '', '```'));
		expect(html).toBe(
			lines(
				'<pre class="code-block has-highlights" data-language="klingon"><code><span class="line highlighted">Qapla\'! &lt;b&gt;</span>',
				'<span class="line"></span></code></pre>',
				''
			)
		);
	});

	it('show an indented block as plain text', async () => {
		const { html } = await renderSlide('    indented');
		expect(html).toBe('<pre class="code-block"><code><span class="line">indented</span></code></pre>\n');
	});

	it('load no highlighter or grammar for a slide whose code blocks name no language', async () => {
		vi.resetModules();
		const loads = vi.fn();
		vi.doMock('#lib/code-highlight.ts', () => {
			loads();
			return { highlightCode: () => Promise.resolve() };
		});
		try {
			const fresh = await import('#lib/slide-render.ts');
			await fresh.renderSlide(
				lines('# No code', '', 'Just `inline` code.', '', '    indented', '', '```', 'plain', '```')
			);
			expect(loads).not.toHaveBeenCalled();
			await fresh.renderSlide(lines('```ts', 'let a;', '```'));
			expect(loads).toHaveBeenCalledOnce();
		} finally {
			vi.doUnmock('#lib/code-highlight.ts');
		}
	});
});
