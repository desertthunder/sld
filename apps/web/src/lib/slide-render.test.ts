import { describe, expect, it, vi } from 'vitest';
import { sampleSlide } from '#lib/sample-slide.ts';
import { renderSlide } from '#lib/slide-render.ts';

const lines = (...rows: string[]) => rows.join('\n');

describe('renderSlide', () => {
	it('turns the sample slide into HTML and reads its frontmatter', async () => {
		const slide = await renderSlide(sampleSlide);
		expect(slide.frontmatter).toEqual({ format: 'toml', raw: 'title = "Welcome"', data: { title: 'Welcome' } });
		expect(slide.html).toMatchInlineSnapshot(`
			"<h1>Welcome to sld</h1>
			<p>Each slide is <strong>markdown</strong>, with <a href="https://commonmark.org">links</a>, <code>code</code> and <del>mistakes</del>.</p>
			<h2>Lists</h2>
			<ul>
			<li>Paste a deck</li>
			<li>Edit a slide
			<ol>
			<li>Change its markdown</li>
			<li>See it change</li>
			</ol>
			</li>
			</ul>
			<ul class="contains-task-list">
			<li class="task-list-item"><input type="checkbox" checked disabled> Split on <code>---</code></li>
			<li class="task-list-item"><input type="checkbox" disabled> Present</li>
			</ul>
			<table>
			<thead>
			<tr>
			<th style="text-align: left">Key</th>
			<th style="text-align: right">Action</th>
			</tr>
			</thead>
			<tbody>
			<tr>
			<td style="text-align: left"><kbd>Right</kbd></td>
			<td style="text-align: right">Next slide</td>
			</tr>
			<tr>
			<td style="text-align: left"><kbd>Left</kbd></td>
			<td style="text-align: right">Go back</td>
			</tr>
			</tbody>
			</table>
			<pre class="code-block" data-language="ts" data-label="TypeScript"><code><span class="line" data-label="TypeScript"><span class="line-code"><span class="code-keyword">const</span> deck = <span class="code-function">splitDeck</span>(markdown);</span></span></code></pre>
			<p><img src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22160%22%20height%3D%2290%22%3E%3Crect%20width%3D%22160%22%20height%3D%2290%22%20rx%3D%228%22%20fill-opacity%3D%22.25%22%2F%3E%3C%2Fsvg%3E" alt="A 16:9 frame"></p>
			"
		`);
	});

	it('reads YAML frontmatter and leaves it out of the HTML', async () => {
		const slide = await renderSlide(lines('---', 'class: wide', '---', '# One'));
		expect(slide).toEqual({
			html: '<h1>One</h1>\n',
			frontmatter: { format: 'yaml', raw: 'class: wide', data: { class: 'wide' } }
		});
	});

	it('shows a block that does not parse as frontmatter as slide text, as the deck splitter does', async () => {
		const slide = await renderSlide(lines('---', 'class: [', '---', 'One'));
		expect(slide.frontmatter).toBeUndefined();
		expect(slide.html).toContain('class: [');
	});

	it('leaves directives as text', async () => {
		const slide = await renderSlide(lines(':::note', 'One', ':::'));
		expect(slide.html).toBe('<p>:::note\nOne\n:::</p>\n');
	});

	it('returns the cached result for markdown it has seen', async () => {
		const markdown = '# Cached';
		expect(await renderSlide(markdown)).toBe(await renderSlide(markdown));
	});

	it('forgets the least recently used slide once the cache is full', async () => {
		vi.resetModules();
		const fresh = await import('#lib/slide-render.ts');
		const oldest = await fresh.renderSlide('# Oldest');
		const untouched = await fresh.renderSlide('# Untouched');
		for (let index = 0; index < fresh.cacheSize - 2; index++) await fresh.renderSlide(`# Slide ${index}`);
		expect(await fresh.renderSlide('# Oldest')).toBe(oldest);
		await fresh.renderSlide('# One more');
		expect(await fresh.renderSlide('# Oldest')).toBe(oldest);
		expect(await fresh.renderSlide('# Untouched')).not.toBe(untouched);
	});

	it('fails every slide with a load error after Sätteri fails to load, as the browser keeps the failed module', async () => {
		vi.resetModules();
		let loads = 0;
		vi.doMock('satteri', () => {
			loads++;
			throw new Error('offline');
		});
		try {
			const fresh = await import('#lib/slide-render.ts');
			for (const markdown of ['# One', '# Two']) {
				await expect(fresh.renderSlide(markdown)).rejects.toBeInstanceOf(fresh.RendererLoadError);
			}
			expect(loads).toBe(1);
		} finally {
			vi.doUnmock('satteri');
		}
	});
});
