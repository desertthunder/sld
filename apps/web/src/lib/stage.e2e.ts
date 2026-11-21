import { expect, test, type Browser, type BrowserType, type Page } from '@playwright/test';

type Screen = { width: number; height: number; deviceScaleFactor: number };
type Browsers = { browser: Browser; browserName: string; firefox: BrowserType };
type Showing = { page: Page; close: () => Promise<void> };

/**
 * Opens a page on a screen `width` by `height` with `deviceScaleFactor`. Firefox drops an emulated scale factor when it
 * moves a page to a cross-origin isolated process, so in Firefox the screen is a browser of its own with that scale.
 */
async function openScreen({ browser, browserName, firefox }: Browsers, screen: Screen): Promise<Showing> {
	const { width, height, deviceScaleFactor } = screen;
	if (browserName !== 'firefox') {
		const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
		return { page, close: () => page.close() };
	}
	const own = await firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(deviceScaleFactor) } });
	const page = await own.newPage({ viewport: { width, height }, baseURL: test.info().project.use.baseURL });
	return { page, close: () => own.close() };
}

/** Opens the sample slide on `/app`, with the preview filling a screen `width` by `height`. */
async function showSlide(browsers: Browsers, screen: Screen): Promise<Showing> {
	const showing = await openScreen(browsers, screen);
	const { page } = showing;
	await page.goto('/app');
	await expect(page.locator('article.slide')).toBeVisible({ timeout: 30_000 });
	await page.locator('.preview').evaluate((preview, { width, height }) => {
		preview.style.cssText = `position: fixed; top: 0; left: 0; width: ${width}px; height: ${height}px; max-width: none`;
	}, screen);
	await expect.poll(() => stageWidth(page)).toBeCloseTo(screen.width, 0);
	await page.evaluate(() => document.fonts.ready);
	return showing;
}

function stageWidth(page: Page): Promise<number> {
	return page.locator('.stage').evaluate((stage) => stage.getBoundingClientRect().width);
}

type Comparison = { changed: number; sharpness: [number, number] };

/**
 * Compares two screenshots of the same size. `changed` is the share of 4 by 4 pixel blocks, among those where either
 * screenshot shows more than the background, whose mean brightness differs by more than a quarter of its range: text
 * laid out differently changes many, while browsers placing a glyph a fraction of a pixel apart change almost none.
 * `sharpness` is each screenshot's mean change in brightness to the next pixel across and down, over the pixels it
 * draws on: blurring text spreads the same edges over more pixels, which lowers it, and so does scaling up a picture of
 * the text.
 */
async function compare(page: Page, first: Buffer, second: Buffer): Promise<Comparison> {
	return page.evaluate(
		async ([a, b]) => {
			// Playwright runs this function in the page as source text, so it can't call functions outside it.
			// eslint-disable-next-line unicorn/consistent-function-scoping
			const brightness = async (base64: string) => {
				const response = await fetch(`data:image/png;base64,${base64}`);
				const bitmap = await createImageBitmap(await response.blob());
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
				context.drawImage(bitmap, 0, 0);
				const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
				const values = Float32Array.from(
					{ length: width * height },
					(_, pixel) => 0.299 * data[pixel * 4] + 0.587 * data[pixel * 4 + 1] + 0.114 * data[pixel * 4 + 2]
				);
				return { values, width, height };
			};
			const [one, two] = await Promise.all([brightness(a), brightness(b)]);
			if (one.width !== two.width || one.height !== two.height) {
				throw new Error(`The screenshots are ${one.width}×${one.height} and ${two.width}×${two.height}`);
			}
			const { width, height } = one;
			const background = one.values[0];
			const isDrawn = (value: number) => Math.abs(value - background) > 8;

			const sharpness = (values: Float32Array) => {
				let drawn = 0;
				let edges = 0;
				for (let y = 0; y < height - 1; y++) {
					for (let x = 0; x < width - 1; x++) {
						const pixel = y * width + x;
						if (!isDrawn(values[pixel])) continue;
						drawn++;
						edges +=
							Math.abs(values[pixel + 1] - values[pixel]) +
							Math.abs(values[pixel + width] - values[pixel]);
					}
				}
				return edges / drawn;
			};

			const block = 4;
			const blockMean = (values: Float32Array, left: number, top: number) => {
				let sum = 0;
				for (let y = top; y < top + block; y++) {
					for (let x = left; x < left + block; x++) sum += values[y * width + x];
				}
				return sum / block ** 2;
			};
			let drawn = 0;
			let changed = 0;
			for (let top = 0; top + block <= height; top += block) {
				for (let left = 0; left + block <= width; left += block) {
					const [mine, theirs] = [blockMean(one.values, left, top), blockMean(two.values, left, top)];
					if (!isDrawn(mine) && !isDrawn(theirs)) continue;
					drawn++;
					if (Math.abs(mine - theirs) > 64) changed++;
				}
			}
			return {
				changed: changed / drawn,
				sharpness: [sharpness(one.values), sharpness(two.values)] as [number, number]
			};
		},
		[first.toString('base64'), second.toString('base64')]
	);
}

/**
 * Screenshots the slide twice at the same size in device pixels: once at `scale` on a screen with `deviceScaleFactor`,
 * and once at scale 1 on a screen whose device pixels match.
 */
async function screenshotsAt(browsers: Browsers, scale: number, deviceScaleFactor: number): Promise<Comparison> {
	const scaled = await showSlide(browsers, { width: 1920 * scale, height: 1080 * scale, deviceScaleFactor });
	const native = await showSlide(browsers, {
		width: 1920,
		height: 1080,
		deviceScaleFactor: deviceScaleFactor * scale
	});
	const shots = await Promise.all([scaled, native].map(({ page }) => page.screenshot()));
	const comparison = await compare(native.page, shots[0], shots[1]);
	await Promise.all([scaled.close(), native.close()]);
	return comparison;
}

test('a slide 320 px wide differs from the same slide 1920 px wide only by scale', async ({
	browser,
	browserName,
	playwright
}) => {
	test.slow();
	const { changed } = await screenshotsAt({ browser, browserName, firefox: playwright.firefox }, 1 / 6, 6);
	expect(changed).toBeLessThan(0.01);
});

for (const [scale, deviceScaleFactor] of [
	[1 / 6, 6],
	[1 / 2, 2],
	[2, 1]
]) {
	test(`text on a slide ${1920 * scale} px wide is as sharp as text drawn at that size`, async ({
		browser,
		browserName,
		playwright
	}) => {
		test.slow();
		const browsers = { browser, browserName, firefox: playwright.firefox };
		const { sharpness } = await screenshotsAt(browsers, scale, deviceScaleFactor);
		expect(sharpness[0] / sharpness[1]).toBeGreaterThan(0.97);
	});
}

test('resizing the window rescales the slide without drawing its HTML again', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/app');
	const slide = page.locator('article.slide');
	await expect(slide).toBeVisible({ timeout: 30_000 });
	const before = await stageWidth(page);
	const nodes = await slide.evaluate((article) => {
		const heading = article.querySelector('h1');
		Object.assign(globalThis, { originalSlide: article, originalHeading: heading });
		return article.childNodes.length;
	});

	await page.setViewportSize({ width: 600, height: 800 });
	await expect.poll(() => stageWidth(page)).toBeLessThan(before);

	const kept = await page.evaluate(() => {
		const { originalSlide, originalHeading } = globalThis as unknown as Record<string, Element>;
		const article = document.querySelector('article.slide');
		return {
			sameSlide: article === originalSlide,
			sameHeading: article?.querySelector('h1') === originalHeading && originalHeading.isConnected,
			nodes: article?.childNodes.length
		};
	});
	expect(kept).toEqual({ sameSlide: true, sameHeading: true, nodes });
});

test('a slide taller than the stage is clipped and flagged as overflowing', async ({
	browser,
	browserName,
	playwright
}) => {
	// A frame taller than the stage leaves a bar under it, so only the stage itself can clip the slide there.
	const { page, close } = await showSlide(
		{ browser, browserName, firefox: playwright.firefox },
		{ width: 640, height: 720, deviceScaleFactor: 1 }
	);
	const frame = page.locator('.frame');
	const article = page.locator('article.slide');
	const isTallAt = (y: number) => page.evaluate((y) => document.elementFromPoint(320, y)?.id === 'tall', y);

	await article.evaluate((slide) => (slide.innerHTML = '<p>Short</p>'));
	await expect(frame).toHaveAttribute('data-overflowing', 'false');

	await article.evaluate((slide) => slide.insertAdjacentHTML('beforeend', '<div id="tall" style="height: 1200px">'));
	await expect(frame).toHaveAttribute('data-overflowing', 'true');
	expect(await isTallAt(530)).toBe(true);
	expect(await isTallAt(550)).toBe(false);

	await page.locator('#tall').evaluate((tall) => tall.remove());
	await expect(frame).toHaveAttribute('data-overflowing', 'false');
	await close();
});

test('a slide that fits is not flagged for the margin under its last block', async ({ page }) => {
	await page.goto('/app');
	const article = page.locator('article.slide');
	await expect(article).toBeVisible({ timeout: 30_000 });

	// 952 px fills the stage between the slide's padding, and the list's own bottom margin would push it 32 px past.
	await article.evaluate(
		(slide) => (slide.innerHTML = '<ul style="margin-top: 0"><li style="height: 952px"></li></ul>')
	);
	await expect(page.locator('.frame')).toHaveAttribute('data-overflowing', 'false');
	expect(await page.locator('.content').evaluate((content) => content.clientHeight)).toBe(1080);
});

test('a slide wider than the stage wraps what it can and is flagged for what it cannot', async ({ page }) => {
	await page.goto('/app');
	const article = page.locator('article.slide');
	await expect(article).toBeVisible({ timeout: 30_000 });
	const frame = page.locator('.frame');
	const stageScrollWidth = () => page.locator('.stage').evaluate((stage) => stage.scrollWidth);
	const wide = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="100"/>';

	await article.evaluate(
		(slide, wide) =>
			(slide.innerHTML = `<p>https://example.com/${'x'.repeat(400)}</p><img src="data:image/svg+xml,${encodeURIComponent(wide)}">`),
		wide
	);
	await expect
		.poll(() => page.locator('.slide img').evaluate((image) => image.getBoundingClientRect().width))
		.toBeGreaterThan(0);
	expect(await stageScrollWidth()).toBe(1920);
	await expect(frame).toHaveAttribute('data-overflowing', 'false');

	// Growing a line that doesn't wrap changes neither the stage's size nor the slide's height.
	await article.evaluate((slide) => (slide.innerHTML = '<pre><code>const deck = 1;</code></pre>'));
	await expect(frame).toHaveAttribute('data-overflowing', 'false');
	await page.locator('.slide code').evaluate((code) => (code.firstChild as Text).appendData(' + 1'.repeat(200)));
	await expect(frame).toHaveAttribute('data-overflowing', 'true');

	await page.locator('.slide code').evaluate((code) => ((code.firstChild as Text).data = 'const deck = 1;'));
	await expect(frame).toHaveAttribute('data-overflowing', 'false');
});
