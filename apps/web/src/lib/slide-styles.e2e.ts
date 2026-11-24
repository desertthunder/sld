import { expect, test, type Page } from '@playwright/test';
import type * as StageFixtureModule from '#lib/stage-fixture.ts';

// The dev server serves the app's modules at their source paths.
const stageFixtureModule = '/src/lib/stage-fixture.ts';

// A 320 by 120 PNG of a rounded rectangle in 30% black. A slide drops an SVG data image.
const chart =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAB4CAYAAACDziveAAAE9ElEQVR42u3cQW9U1xmA4XfugN2SkEA2pWlCoYtUXaZdpFL/v6pskkVbVd2UKKkU2koJIQnIDma6mHPJxMXYGCTwzPNIaGR55hrZ0qvzzTlzF53PolptfH2lul5dG4971ZvHngNw3t58Vx1WX1f3xuODZzTpzBc+b/j2qxvV+9VbI3rz91fVY3834CWZRl/mxhxW96svqrvVwXlCuDjHf2S/ul3dGiu/VXV0LHgLfy/gJVsdC+JytOZB9Vl1ZyOELy2Am0X9TfXb6ufVo43oCR7wqoI4VZeqh9U/qn+edTV4WrjmC+xXv69+uRE+0QNepxjOIfyy+mSsBp8ZweUZ4vdO9afWmxs/WPEBr6G5SUfV29WvWm+UPHxWr5anxO9m9dGo6iPhAy5ACI9ab8r+egTwm5PatTwlfn/oxw0O8QMuSgTn/Yn3Wm+SPDWCyxPid73644jfSvyACxjB+Ujeu9V/njYOT8deNG94fLTxtfgBFzmCjabtd2xDZDr25KoPWx9zORI/YAsieDSa9uGx1j0ZgedS3qo+aL3bK37ANkXw2hiD7819mzZG3b3qd9ntBbYzgo9G4/bmUXjaiN3t1h9t8xleYBs9Ho27PUdx2lj93Tb6Alu+CvxhtG6vWs0j8I3qDas/YAdWgW+M5j0ZgW+KH7BDEbw5j8D7re/n59gLsAtj8NFo3v7U+mYHT3ZFALbcvO/xztT6Y2/nup00wAUN4KK6PrU+HCh+wK5F8Npk/AV2dQyeqqu53RWwO+bbZV2drP6AXV0FTn4HwK4SQEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBAQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEODVB3Dh1wDsoMVUfTtCuPL7AHbAajTv26k6tAoEdm31Vx1O1T0BBHYwgPem6uuxJBRBYFfit6q+nqqvjMHAro2/1VdTdVDdr5bZCAG222q07n51MO/+fp4zgcBumEbzVnP07lbfiyCwA/H7fjTvyUHow+pOddkYDGzx+Ht5tO6wcRB6Dt6d6oFVILDFq78Ho3VtjsDzKvDv1SWrQGALV3+XRuOenHpZbjxh0fpQ9Nvj31GOxgDbM/p+Wf21H88B/mTcnVd9n1YPcywG2I74LUfTPj3Wuv97v2/R+lzgxxtfiyBwUeM3T7Efj7b9ZKpdPuVFi1HLh9V74yI+KgdcxPhdqj6p/v20Bd3yhBcvqm9a75i8O1aKj0UQuEBj72LE7/OTptnlMy4yR/C/1S+qn2VjBHj943d5TLB/bn3g+cS38panXGweh/9VXa2uGYmB1zR804jf3RG/7zplH2N5hgsvqkcjggfV9bEaXG1cWAyBVxG9NsJ3UP2t+svGtLo6LW7Pa7+6Xd2qrowfcNT6PcIXuS7AWYI3R29+n+9B9VnrT3gcPM8FnzdUm0Xdr25U71dvVXsb318dCyLAi5jvWzA35rD1La2+GCPvwVMa9dID2Ak/5MoYja+Nx73qzZwhBF7covX7eYet72B/bzw+eEaTzuR/Oa/1qsTbTGMAAAAASUVORK5CYII=';

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

![A chart](${chart})`
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
		await show(page, `![A chart](${chart})`);
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
