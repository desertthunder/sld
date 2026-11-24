import { expect, test, type Page } from '@playwright/test';
import type * as StageFixtureModule from '#lib/stage-fixture.ts';

// The dev server serves the app's modules at their source paths.
const stageFixtureModule = '/src/lib/stage-fixture.ts';

const chart =
	'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="24" fill-opacity=".3"/></svg>';

const slides = {
	title: `---
layout: title
---
# Field notes on sleep

What a month of sleep diaries taught me

Reading group · 21 November`,
	default: `# The pattern

Two habits moved my sleep more than anything else I tried. Both showed up in the \`wake_time\` column first.

- Late coffee cost me forty minutes
- Weekends shifted everything by two hours`,
	center: `---
layout: center
---
## A fixed wake-up time mattered more than bedtime.

Thirty-one nights, one variable at a time`,
	section: `---
layout: section
---
Part 2

# What changed`,
	text: `# Every element

## A heading 2

### A heading 3

Text with a [link](https://example.com), \`inline code\`, **bold**, *italics* and a note.[^1]

- Cut coffee after noon
  - Tea stayed
  1. Decaf after three
- [x] Keep the diary
- [ ] Try a weekend alarm

[^1]: A footnote above the bottom margin.`,
	quote: `> The best bedtime is the one that follows a fixed morning.
>
> <cite>From my diary, night 19</cite>

Read the notes at [sleep-diary.example](https://sleep-diary.example), or run \`sld export\` for the markdown.[^1]

[^1]: Sample text. Export lives in the app, not on a command line.`,
	blocks: `## Every block

| Week               | Hours |
| :----------------- | ----: |
| 1 · no changes     |   6.4 |
| 4 · both           |   7.6 |

> The best bedtime is the one that follows a fixed morning.

\`\`\`ts
const night = { asleep: '23:20', awake: '06:45' };
\`\`\`

---

![A chart](data:image/svg+xml,${encodeURIComponent(chart)})`
};

const schemes = ['oxocarbon-dark', 'oxocarbon-light'];

test.describe('slide styles', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'The screenshots are Chromium’s.');

	for (const scheme of schemes) {
		for (const [name, markdown] of Object.entries(slides)) {
			test(`a ${name} slide in ${scheme} looks as pinned`, async ({ page }) => {
				await page.setViewportSize({ width: 960, height: 540 });
				await page.goto('/app');
				await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({
					timeout: 30_000
				});
				await page.evaluate(
					async ({ url, markdown, scheme }) => {
						const { showStyledSlide } = (await import(url)) as typeof StageFixtureModule;
						await showStyledSlide(markdown, scheme);
					},
					{ url: stageFixtureModule, markdown, scheme }
				);
				await expect(page.locator('article.slide')).toBeVisible({ timeout: 30_000 });
				await page.evaluate(async () => {
					await Promise.all(
						[
							'500 96px "Hubot Sans Variable"',
							'400 44px "Mona Sans Variable"',
							'400 30px "Monaspace Neon"'
						].map((font) => document.fonts.load(font))
					);
					await document.fonts.ready;
					await Promise.allSettled([...document.images].map((image) => image.decode()));
				});
				await expect(page.locator('.preview')).toHaveScreenshot(`${name}-${scheme}.png`);
				await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
			});
		}
	}
});

/** Opens `/app` and draws `markdown` as a slide filling a 960 by 540 window. */
async function show(page: Page, markdown: string) {
	await page.setViewportSize({ width: 960, height: 540 });
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	await page.evaluate(
		async ({ url, markdown }) => {
			const { showStyledSlide } = (await import(url)) as typeof StageFixtureModule;
			await showStyledSlide(markdown, 'oxocarbon-dark');
		},
		{ url: stageFixtureModule, markdown }
	);
	await expect(page.locator('article.slide')).toBeVisible({ timeout: 30_000 });
	await page.evaluate(() => document.fonts.ready);
}

function fontSize(page: Page, selector: string): Promise<number> {
	return page
		.locator(selector)
		.first()
		.evaluate((element) => Number(getComputedStyle(element).fontSize.replace('px', '')));
}

/** The gap in stage pixels between the bottom of the element `above` and the top of the next element after it. */
function gapUnder(page: Page, above: string): Promise<number> {
	return page.locator(above).evaluate((element) => {
		const next = element.nextElementSibling as HTMLElement;
		const box = element.getBoundingClientRect();
		const scale = box.width / (element as HTMLElement).offsetWidth;
		return Math.round((next.getBoundingClientRect().top - box.bottom) / scale);
	});
}

/** The computed styles that say how text is drawn: its color, face, size and weight, and where it sits on the line. */
function textStyle(page: Page, selector: string, pseudo?: string) {
	return page.locator(selector).evaluate((element, pseudo) => {
		const style = getComputedStyle(element, pseudo);
		return {
			color: style.color,
			face: style.fontFamily.split(',', 1)[0].replaceAll(/["']/g, ''),
			size: style.fontSize,
			weight: style.fontWeight,
			align: style.verticalAlign
		};
	}, pseudo);
}

/** The color a slide color role such as `muted` resolves to on the slide. */
function roleColor(page: Page, role: string): Promise<string> {
	return page.locator('article.slide').evaluate((slide, role) => {
		const probe = document.createElement('span');
		probe.style.color = `var(--${role})`;
		slide.append(probe);
		const { color } = getComputedStyle(probe);
		probe.remove();
		return color;
	}, role);
}

test.describe('matching the artboards', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'The artboards were measured in Chromium.');

	test('a center slide leaves 40 px between its heading and the line under it', async ({ page }) => {
		await show(page, slides.center);
		expect(await gapUnder(page, '.slide h2')).toBe(40);
	});

	test('a cite in a quote is muted body text at 34 px', async ({ page }) => {
		await show(page, slides.quote);
		expect(await textStyle(page, '.slide blockquote cite')).toEqual({
			color: await roleColor(page, 'muted'),
			face: 'Mona Sans Variable',
			size: '34px',
			weight: '400',
			align: 'baseline'
		});
	});

	test('a footnote opens with its number drawn as the superscript that marks it in the text', async ({ page }) => {
		await show(page, slides.quote);
		const marker = { color: await roleColor(page, 'link'), face: 'Monaspace Neon', weight: '400', align: 'super' };
		expect(await textStyle(page, '.slide p sup')).toEqual({ ...marker, size: '24.2px' });
		expect(await textStyle(page, '.slide section.footnotes li > p', '::before')).toEqual({
			...marker,
			size: '16.5px'
		});
		expect(
			await page
				.locator('.slide section.footnotes li > p')
				.evaluate((paragraph) => getComputedStyle(paragraph, '::before').content)
		).toBe('counter(footnote)');
		await expect(page.locator('.slide section.footnotes ol')).toHaveCSS('list-style-type', 'none');
	});

	test('an open disclosure leaves a gap under its summary', async ({ page }) => {
		await show(page, '<details open><summary>More</summary>\n\nWhat the diary said\n\n</details>');
		expect(await gapUnder(page, '.slide summary')).toBe(40);
	});
});

/** A list of `count` items. */
function items(count: number): string {
	return Array.from({ length: count }, (_, index) => `- Item ${index + 1}`).join('\n');
}

/** A code block whose one line holds a string `length` characters long. */
function codeLine(length: number): string {
	return `\`\`\`\nconst items = '${'x'.repeat(length)}';\n\`\`\``;
}

test.describe('fitting a slide', () => {
	test('a lone image fills the content area', async ({ page }) => {
		await show(page, `![A chart](data:image/svg+xml,${encodeURIComponent(chart)})`);
		const box = await page
			.locator('.slide img')
			.evaluate((image: HTMLImageElement) => ({
				left: image.offsetLeft,
				top: image.offsetTop,
				width: image.offsetWidth,
				height: image.offsetHeight
			}));
		expect(box).toEqual({ left: 120, top: 104, width: 1680, height: 880 });
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});

	test('a paragraph or code block after the first in a list item keeps a gap above it', async ({ page }) => {
		await show(page, '- Step one\n\n  More about it\n\n  ```ts\n  const step = 1;\n  ```');
		const gaps = await page
			.locator('.slide li')
			.evaluate((item) =>
				[...item.children]
					.slice(1)
					.map(
						(child) =>
							(child as HTMLElement).offsetTop -
							((child.previousElementSibling as HTMLElement).offsetTop +
								(child.previousElementSibling as HTMLElement).offsetHeight)
					)
			);
		// Offsets round to whole pixels, so an 18 px gap can measure 17.
		expect(gaps.map((gap) => Math.abs(gap - 18) <= 1)).toEqual([true, true]);
	});

	test('a slide that runs long shrinks its text to fit, and past the floor stops at it and is flagged', async ({
		page
	}) => {
		await show(page, `# Everything I wrote down\n\n${items(12)}`);
		await expect.poll(() => fontSize(page, '.slide li')).toBeLessThan(44);
		expect(await fontSize(page, '.slide li')).toBeGreaterThan(32);
		expect(await fontSize(page, '.slide h1')).toBeGreaterThan(72);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');

		await page.evaluate(async (url) => {
			const { showStyledSlide } = (await import(url)) as typeof StageFixtureModule;
			await showStyledSlide(`# Everything I wrote down\n\n${'- An item\n'.repeat(30)}`, 'oxocarbon-dark');
		}, stageFixtureModule);
		await expect.poll(() => fontSize(page, '.slide li')).toBe(32);
		expect(await fontSize(page, '.slide h1')).toBe(72);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'true');
	});

	test('a code block with a long line shrinks its code to fit, down to 20 px, and then clips', async ({ page }) => {
		await show(page, codeLine(80));
		await expect.poll(() => fontSize(page, '.slide pre')).toBeLessThan(30);
		expect(await fontSize(page, '.slide pre')).toBeGreaterThan(20);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');

		await page
			.locator('.slide code')
			.evaluate((code) => ((code.firstChild as Element).textContent += 'x'.repeat(200)));
		await expect.poll(() => fontSize(page, '.slide pre')).toBe(20);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'true');
	});
	test('a code block whose labeled first line is too long for it shrinks its code too', async ({ page }) => {
		await show(page, `\`\`\`ts\nconst items = '${'x'.repeat(70)}';\n\`\`\``);
		await expect.poll(() => fontSize(page, '.slide pre')).toBeLessThan(30);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});

	test('a title slide shrinks before its subtitle runs into the pinned last line', async ({ page }) => {
		// At full size, this subtitle ends 27 px into the pinned line and 15 px above the bottom margin.
		const subtitle =
			'What a month of sleep diaries taught me about mornings, coffee, weekends, alarms, light, and the habits that ' +
			'moved my sleep the most over thirty-one nights, and what I would tell anyone who wants to start a sleep diary ' +
			'of their own this winter, with a notebook and a pen by the bed, every single night, even on the weekends and ' +
			'holidays when it feels pointless and the coffee is calling from the kitchen downstairs again before the sun ' +
			'is even up over the hills to the east of town';
		await show(
			page,
			`---\nlayout: title\n---\n# Field notes on sleep and the long title\n\n${subtitle}\n\nReading group · 21 November`
		);
		await expect.poll(() => fontSize(page, '.slide h1')).toBeLessThan(136);
		const gap = await page
			.locator('.slide > p:last-child')
			.evaluate(
				(last: HTMLElement) =>
					last.offsetTop -
					((last.previousElementSibling as HTMLElement).offsetTop +
						(last.previousElementSibling as HTMLElement).offsetHeight)
			);
		expect(gap).toBeGreaterThan(0);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});

	test('a slide fits again when a disclosure on it opens', async ({ page }) => {
		await show(page, `# Everything I wrote down\n\n<details><summary>More</summary>\n\n${items(10)}\n\n</details>`);
		expect(await fontSize(page, '.slide summary')).toBe(44);
		await page.locator('.slide details').evaluate((details: HTMLDetailsElement) => (details.open = true));
		await expect.poll(() => fontSize(page, '.slide summary')).toBeLessThan(44);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});

	test('a slide fits again when an image on it loads', async ({ page }) => {
		const held = Promise.withResolvers<void>();
		await page.route('**/late-image.svg', async (route) => {
			await held.promise;
			await route.fulfill({
				contentType: 'image/svg+xml',
				body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400"/></svg>'
			});
		});
		await show(page, `# Everything I wrote down\n\n${items(5)}\n\n![A chart](/late-image.svg)`);
		expect(await fontSize(page, '.slide li')).toBe(44);
		held.resolve();
		await expect.poll(() => fontSize(page, '.slide li')).toBeLessThan(44);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});

	test('a slide fits again when a font it uses loads', async ({ page }) => {
		const line = 'Sleep diaries kept for a month, one line each night';
		await show(page, `# Everything I wrote down\n\n${Array.from({ length: 8 }, () => `- ${line}`).join('\n')}`);
		expect(await fontSize(page, '.slide li')).toBe(44);
		// Nothing has drawn the italic code face yet, so it loads only now, after the slide fitted, and is wider than the
		// body face. A style change alone fits nothing.
		await page.locator('article.slide').evaluate((slide: HTMLElement) => {
			slide.style.setProperty('--font-body', "'Monaspace Neon'");
			slide.style.fontStyle = 'italic';
		});
		await expect.poll(() => fontSize(page, '.slide li')).toBeLessThan(44);
	});

	test('text hidden for screen readers in a pixel-sized box does not flag the slide', async ({ page }) => {
		await show(
			page,
			'# A chart\n\n<span style="position: absolute; width: 1px; height: 1px; overflow: hidden">Hours slept, by week</span>'
		);
		await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	});
});
