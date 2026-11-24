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
});
