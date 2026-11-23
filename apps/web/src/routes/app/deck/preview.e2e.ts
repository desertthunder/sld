import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type * as SampleSlideModule from '#lib/sample-slide.ts';
import type * as SlideRenderModule from '#lib/slide-render.ts';

// The dev server serves the app's modules at their source paths, the same modules the app runs.
const modules = {
	database: '/src/lib/database.ts',
	decks: '/src/lib/decks.ts',
	sample: '/src/lib/sample-slide.ts',
	render: '/src/lib/slide-render.ts'
};

/** Creates a deck in the page's database and returns its id. `sample` stands for the sample slide. */
async function createDeck(page: Page, slides: string[]): Promise<string> {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	return page.evaluate(
		async ({ urls, slides }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const { sampleSlide } = (await import(urls.sample)) as typeof SampleSlideModule;
			const markdowns = slides.map((slide) => (slide === 'sample' ? sampleSlide : slide));
			const deck = await createDeck(await openDatabase(), { title: 'Talk', slides: markdowns });
			return deck.id;
		},
		{ urls: modules, slides }
	);
}

const slideList = (page: Page) => page.getByRole('navigation', { name: 'Slides' });
const previewPane = (page: Page) => page.getByRole('region', { name: 'Preview' });
const previewSlide = (page: Page) => previewPane(page).locator('article.slide');
const editPane = (page: Page) => page.getByRole('region', { name: 'Markdown' });
const warnings = (page: Page) => editPane(page).getByRole('status');
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const thumbnails = (page: Page) => slideList(page).locator('.thumb');

async function openDeck(page: Page, id: string, search = '') {
	await page.goto(`/app/deck/${id}${search}`);
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
}

function renderCalls(page: Page): Promise<number> {
	return page.evaluate(
		async (url) => ((await import(url)) as typeof SlideRenderModule).renderCount.calls,
		modules.render
	);
}

test('the preview follows each keystroke without waiting for the database', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await expect(previewSlide(page).locator('h1')).toHaveText('One', { timeout: 30_000 });

	// Holds the database until the test lets go, so no edit can be stored while the preview updates.
	await page.evaluate(async (url) => {
		const { openDatabase } = (await import(url)) as typeof DatabaseModule;
		const { $client } = await openDatabase();
		// Resolves once the transaction holds the database.
		await new Promise<void>((held) => {
			void $client.transaction(
				() =>
					new Promise<void>((release) => {
						Object.assign(globalThis, { releaseDatabase: release });
						held();
					})
			);
		});
	}, modules.database);

	await editor(page).press('End');
	for (const [key, heading] of [
		['!', 'One!'],
		['?', 'One!?']
	] as const) {
		await editor(page).press(key);
		await expect(previewSlide(page).locator('h1')).toHaveText(heading);
	}
	await expect(page.getByText('Saving…', { exact: true })).toBeVisible();

	await page.evaluate(() => (globalThis as unknown as { releaseDatabase: () => void }).releaseDatabase());
	await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
});

test('broken frontmatter shows a warning under the editor and keeps the last good slide', async ({ page }) => {
	const id = await createDeck(page, ['---\nlayout: center\n---\n# Good']);
	await openDeck(page, id);
	await expect(previewSlide(page)).toHaveClass(/layout-center/, { timeout: 30_000 });
	await expect(previewSlide(page).locator('h1')).toHaveText('Good');
	await expect(warnings(page)).toHaveText('');

	await editor(page).fill('---\nlayout: [center\n---\n# Broken');
	await expect(warnings(page)).toContainText("The frontmatter couldn't be read, so it's ignored:");
	// The strip sits under the text being typed, not under the preview.
	await expect(previewPane(page).getByText("The frontmatter couldn't be read")).toHaveCount(0);
	await expect(previewSlide(page).locator('h1')).toHaveText('Good');
	await expect(previewSlide(page)).toHaveClass(/layout-center/);
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveText('Good');
	await expect(thumbnails(page).first().locator('article.slide')).toHaveClass(/layout-center/);

	await editor(page).fill('---\nlayout: hero\n---\n# Fixed');
	await expect(previewSlide(page).locator('h1')).toHaveText('Fixed');
	await expect(warnings(page)).toHaveText("hero isn't a layout, so the slide uses the default.");
	await expect(warnings(page).locator('code')).toHaveText('hero');

	await editor(page).fill('# Fine');
	await expect(warnings(page)).toHaveText('');
	await expect(warnings(page).locator('.icon')).toHaveCount(0);
});

test('at phone width the warning shows in the Edit tab', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const id = await createDeck(page, ['---\nlayout: hero\n---\n# Hero']);
	await page.goto(`/app/deck/${id}`);
	await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
	await expect(editor(page)).toBeVisible();
	// At phone width each pane is a tab panel, named by its tab.
	const strip = page.getByRole('tabpanel', { name: 'Edit' }).getByRole('status');
	await expect(strip).toBeVisible({ timeout: 30_000 });
	await expect(strip).toHaveText("hero isn't a layout, so the slide uses the default.");
});

test('the slide list shows a thumbnail of each slide, rendered once it scrolls near', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const slides = Array.from({ length: 40 }, (_, index) => `# Slide heading ${index + 1}`);
	const id = await createDeck(page, slides);
	await openDeck(page, id);
	await expect(thumbnails(page)).toHaveCount(40);
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveText('Slide heading 1', {
		timeout: 30_000
	});
	await expect(thumbnails(page).last().locator('article.slide')).toHaveCount(0);
	await expect(thumbnails(page).first()).toHaveAttribute('aria-hidden', 'true');
	// The thumbnail is a picture, so each item keeps its number and heading as its name.
	await expect(slideList(page).getByRole('button', { name: 'Slide 1 Slide heading 1', exact: true })).toBeVisible();

	await slideList(page).locator('button[data-index="39"]').scrollIntoViewIfNeeded();
	await expect(thumbnails(page).last().locator('article.slide h1')).toHaveText('Slide heading 40');

	await editor(page).fill('# Renamed');
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveText('Renamed');
});

test("a thumbnail keeps a slide's audio and video still", async ({ page }) => {
	const id = await createDeck(page, ['# Sound\n\n<audio autoplay></audio><video autoplay></video>']);
	await openDeck(page, id);
	const thumbnail = thumbnails(page).first();
	await expect(thumbnail.locator('article.slide h1')).toHaveText('Sound', { timeout: 30_000 });
	const states = () =>
		thumbnail
			.locator('audio, video')
			.evaluateAll((media) =>
				(media as HTMLMediaElement[]).map(({ autoplay, muted, paused }) => ({ autoplay, muted, paused }))
			);
	await expect.poll(states).toEqual([
		{ autoplay: false, muted: true, paused: true },
		{ autoplay: false, muted: true, paused: true }
	]);
	// The preview draws the slide as it presents.
	await expect(previewSlide(page).locator('audio')).toHaveJSProperty('autoplay', true);

	await editor(page).press('ControlOrMeta+End');
	await editor(page).press('Enter');
	await expect.poll(states).toEqual([
		{ autoplay: false, muted: true, paused: true },
		{ autoplay: false, muted: true, paused: true }
	]);
});

test('a thumbnail draws an empty box in place of each iframe, and the preview keeps the iframe', async ({ page }) => {
	const id = await createDeck(page, [
		'# Embed\n\n<iframe src="/app/embedded" width="640" height="360"></iframe><iframe src="/app/embedded"></iframe>'
	]);
	const requests: string[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('/app/embedded')) requests.push(request.url());
	});
	// Opens in headings view, so only the preview's iframes load before the thumbnails show.
	await page.addInitScript(() => localStorage.setItem('sld:slide-list-view', 'headings'));
	await openDeck(page, id);
	await expect(previewSlide(page).locator('iframe')).toHaveCount(2, { timeout: 30_000 });
	await expect.poll(() => requests.length).toBe(2);

	await slideList(page).getByRole('button', { name: 'Show thumbnails' }).click();
	const thumbnail = thumbnails(page).first();
	await expect(thumbnail.locator('article.slide h1')).toHaveText('Embed', { timeout: 30_000 });
	await expect(thumbnail.locator('iframe')).toHaveCount(0);
	const boxes = thumbnail.locator('[data-frame]');
	await expect(boxes).toHaveCount(2);
	const sizes = await boxes.evaluateAll(boxSizes);
	const frameSizes = await previewSlide(page).locator('iframe').evaluateAll(boxSizes);
	expect(sizes).toEqual(frameSizes);
	expect(frameSizes).toEqual([
		[644, 364],
		[304, 154]
	]);
	expect(requests).toHaveLength(2);
});

test("before any slide renders, a renderer that couldn't load says so in the preview and under the editor", async ({
	page
}) => {
	const id = await createDeck(page, ['# One']);
	await page.route('**/satteri/**', (route) => route.abort());
	await openDeck(page, id);
	const message = "Slides couldn't be loaded. Reload the page to try again:";
	await expect(previewPane(page).getByRole('alert')).toContainText(message, { timeout: 30_000 });
	await expect(warnings(page)).toContainText(message);
	await expect(previewSlide(page)).toHaveCount(0);
});

test('in the thumbnail view, adding, duplicating and deleting a slide move the thumbnails with their slides', async ({
	page
}) => {
	const id = await createDeck(page, ['# One', '# Two', '# Three']);
	await openDeck(page, id);
	const headings = () => thumbnails(page).locator('article.slide h1');
	await expect(headings()).toHaveText(['One', 'Two', 'Three'], { timeout: 30_000 });

	await slideList(page).getByRole('button', { name: 'Slide 2 Two', exact: true }).click();
	await slideList(page).getByRole('button', { name: 'Duplicate slide 2' }).click();
	await expect(headings()).toHaveText(['One', 'Two', 'Two', 'Three']);

	await slideList(page).getByRole('button', { name: 'Delete slide 3' }).click();
	await expect(headings()).toHaveText(['One', 'Two', 'Three']);
	await slideList(page).getByRole('button', { name: 'Slide 1 One', exact: true }).click();
	await slideList(page).getByRole('button', { name: 'Delete slide 1' }).click();
	await expect(headings()).toHaveText(['Two', 'Three']);

	await slideList(page).getByRole('button', { name: 'New slide' }).click();
	await expect(thumbnails(page)).toHaveCount(3);
	await expect(editor(page)).toHaveText('');
	await editor(page).fill('# Four');
	await expect(headings()).toHaveText(['Two', 'Four', 'Three']);
});

test('the list view toggle switches to headings only, and a reload keeps it', async ({ page }) => {
	const id = await createDeck(page, ['# One', '# Two']);
	await openDeck(page, id);
	const showThumbnails = slideList(page).getByRole('button', { name: 'Show thumbnails' });
	const showHeadings = slideList(page).getByRole('button', { name: 'Show headings only' });
	await expect(showThumbnails).toHaveAttribute('aria-pressed', 'true');
	await expect(thumbnails(page)).toHaveCount(2);

	await showHeadings.click();
	await expect(showHeadings).toHaveAttribute('aria-pressed', 'true');
	await expect(showThumbnails).toHaveAttribute('aria-pressed', 'false');
	await expect(thumbnails(page)).toHaveCount(0);
	await expect(slideList(page).locator('.label').first()).toBeVisible();

	await page.reload();
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
	await expect(showHeadings).toHaveAttribute('aria-pressed', 'true');
	await expect(thumbnails(page)).toHaveCount(0);

	await showThumbnails.click();
	await page.reload();
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
	await expect(thumbnails(page)).toHaveCount(2);
});

test('the preview draws a slide as the presenter does at the same size', async ({ page }) => {
	const size = { width: 960, height: 540 };
	const id = await createDeck(page, ['sample']);
	await page.setViewportSize({ width: 1600, height: 900 });
	await openDeck(page, id);
	await expect(previewSlide(page).locator('h1')).toBeVisible({ timeout: 30_000 });
	// The preview's frame sits at the page's corner at the presenter's size, so both stages land on the same pixels.
	await previewPane(page)
		.locator('.surface')
		.evaluate((surface, { width, height }) => {
			surface.style.cssText = `position: fixed; inset: 0 auto auto 0; width: ${width}px; height: ${height}px; padding: 0; z-index: 10`;
		}, size);
	const previewStage = previewPane(page).locator('.stage');
	await expect.poll(() => previewStage.evaluate((stage) => stage.getBoundingClientRect().width)).toBe(size.width);
	await page.evaluate(() => document.fonts.ready);
	const preview = await describeStage(page, previewStage);
	const previewShot = await previewStage.screenshot();

	await page.setViewportSize(size);
	await page.goto(`/app/deck/${id}/present`);
	const presenterStage = page.locator('.stage');
	await expect(presenterStage.locator('article.slide h1')).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => presenterStage.evaluate((stage) => stage.getBoundingClientRect().width)).toBe(size.width);
	await page.evaluate(() => document.fonts.ready);
	// The progress bar is the presenter's own, drawn over the stage's bottom edge, and not part of the slide.
	await page.getByRole('progressbar').evaluate((bar) => (bar.style.display = 'none'));
	const presenter = await describeStage(page, presenterStage);
	const presenterShot = await presenterStage.screenshot();

	expect(preview).toEqual(presenter);
	expect(await changedBlocks(page, previewShot, presenterShot)).toBe(0);
});

test('typing in a 100-slide deck renders only the edited slide again', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const slides = Array.from({ length: 100 }, (_, index) => `# Slide ${index + 1}\n\n- A point\n- Another point`);
	const id = await createDeck(page, slides);
	await openDeck(page, id, '?slide=3');
	await expect(previewSlide(page).locator('h1')).toHaveText('Slide 3', { timeout: 30_000 });
	const rendered = thumbnails(page).locator('article.slide');
	await expect(rendered.nth(4)).toBeVisible();
	await expect(thumbnails(page).nth(2).locator('h1')).toHaveText('Slide 3');
	const shown = await rendered.count();
	expect(shown).toBeGreaterThan(4);
	expect(shown).toBeLessThan(100);

	// Marks every slide drawn before typing, to find which ones were drawn again.
	await page.evaluate(() => {
		for (const article of document.querySelectorAll('article.slide')) (article as HTMLElement).dataset.before = '';
	});
	const before = await renderCalls(page);
	const typed = ' and more';
	await editor(page).press('ControlOrMeta+Home');
	await editor(page).press('End');
	await editor(page).pressSequentially(typed);
	await expect(previewSlide(page).locator('h1')).toHaveText(`Slide 3${typed}`);
	await expect(thumbnails(page).nth(2).locator('h1')).toHaveText(`Slide 3${typed}`);

	// Each keystroke renders the preview and the edited slide's thumbnail, and no other slide.
	expect((await renderCalls(page)) - before).toBe(2 * typed.length);
	const redrawn = await page.evaluate(() =>
		[...document.querySelectorAll('article.slide:not([data-before])')].map((article) => article.textContent)
	);
	expect(redrawn.every((text) => text?.startsWith(`Slide 3${typed}`))).toBe(true);
	await expect(thumbnails(page).nth(3).locator('article.slide')).toHaveAttribute('data-before', '');
});

/** Each element's laid-out width and height, before the stage scales them. */
function boxSizes(elements: (HTMLElement | SVGElement)[]): number[][] {
	return elements.map((element) => [(element as HTMLElement).offsetWidth, (element as HTMLElement).offsetHeight]);
}

/** The stage's size, its slide's HTML and classes, and the computed style of each element on it. */
async function describeStage(page: Page, stage: ReturnType<Page['locator']>) {
	return stage.evaluate((element) => {
		const properties = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'padding', 'margin'];
		const article = element.querySelector('article')!;
		const box = element.getBoundingClientRect();
		return {
			size: [box.width, box.height],
			transform: getComputedStyle(element).transform,
			background: getComputedStyle(element).backgroundColor,
			classes: [...article.classList].filter((name) => !name.startsWith('svelte-')),
			html: article.getHTML(),
			styles: [article, ...article.querySelectorAll('*')].map((node) => {
				const style = getComputedStyle(node);
				return properties.map((property) => style.getPropertyValue(property)).join(' | ');
			})
		};
	});
}

/**
 * The share of 4 by 4 pixel blocks, among those where either screenshot shows more than the background, whose mean
 * brightness differs by more than a quarter of its range. Text laid out, sized or spaced differently changes blocks,
 * while Chromium antialiasing the same glyphs differently, as it does when it draws a stage in a composited layer of its
 * own, keeps every block within that range, so the result doesn't depend on how the browser layers either page.
 */
async function changedBlocks(page: Page, first: Buffer, second: Buffer): Promise<number> {
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
			return changed / drawn;
		},
		[first.toString('base64'), second.toString('base64')]
	);
}
