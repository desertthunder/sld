import { expect, test, type Locator, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type * as SlideRenderModule from '#lib/slide-render.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts', render: '/src/lib/slide-render.ts' };

const base00 = {
	'oxocarbon-dark': 'rgb(22, 22, 22)',
	'oxocarbon-light': 'rgb(242, 244, 248)',
	nord: 'rgb(46, 52, 64)',
	'nord-light': 'rgb(229, 233, 240)',
	'gruvbox-dark-hard': 'rgb(29, 32, 33)'
};

async function createDeck(page: Page, slides: string[], scheme?: string): Promise<string> {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	return page.evaluate(
		async ({ urls, slides, scheme }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Talk', slides, scheme });
			return deck.id;
		},
		{ urls: modules, slides, scheme }
	);
}

function storedScheme(page: Page, id: string): Promise<string | null | undefined> {
	return page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await getDeck(await openDatabase(), id);
			return deck?.scheme;
		},
		{ urls: modules, id }
	);
}

function renderCalls(page: Page): Promise<number> {
	return page.evaluate(
		async (url) => ((await import(url)) as typeof SlideRenderModule).renderCount.calls,
		modules.render
	);
}

const schemeButton = (page: Page) => page.getByRole('button', { name: /^Scheme: / });
const search = (page: Page) => page.getByRole('combobox', { name: 'Search schemes' });
const options = (page: Page) => page.getByRole('listbox', { name: 'Schemes' }).getByRole('option');
const focusedOption = (page: Page) => page.getByRole('listbox', { name: 'Schemes' }).locator('[aria-selected="true"]');
const previewStage = (page: Page) => page.locator('.preview-body .stage');

function background(locator: Locator): Promise<string> {
	return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

const rootBackground = (page: Page) => background(page.locator('html'));

async function openDeck(page: Page, id: string) {
	await page.goto(`/app/deck/${id}`);
	await expect(schemeButton(page)).toBeVisible({ timeout: 30_000 });
}

/** Tabs from the top of the page until `target` has focus, as someone without a pointer would. */
async function tabTo(page: Page, target: Locator) {
	for (let step = 0; step < 20; step++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((element) => element === document.activeElement)) return;
	}
	throw new Error('Tab never reached the target');
}

test('the picker works with the keyboard alone: search, preview with the arrows, use with Enter and close', async ({
	page
}) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await expect(schemeButton(page)).toHaveAccessibleName('Scheme: Oxocarbon Light');
	await tabTo(page, schemeButton(page));
	await page.keyboard.press('Enter');
	await expect(schemeButton(page)).toHaveAttribute('aria-expanded', 'true');
	await expect(search(page)).toBeFocused();
	await expect(search(page)).toHaveAttribute('placeholder', 'Search 375 schemes');
	await expect(focusedOption(page)).toContainText('Oxocarbon Light');
	await expect(focusedOption(page)).toContainText('In use');

	await page.keyboard.type('nord');
	await expect(page.getByText('3 of 375 schemes')).toBeVisible();
	await expect(options(page)).toHaveCount(3);
	await expect(focusedOption(page)).toContainText('Nord');
	await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00.nord);
	await page.keyboard.press('ArrowDown');
	await expect(focusedOption(page)).toContainText('Nord Light');
	await expect(search(page)).toHaveAttribute('aria-activedescendant', /nord-light$/);
	await expect.poll(() => background(previewStage(page))).toBe(base00['nord-light']);
	await page.keyboard.press('Enter');
	await expect(search(page)).toBeHidden();
	await expect(schemeButton(page)).toBeFocused();
	await expect(schemeButton(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(schemeButton(page)).toHaveAccessibleName('Scheme: Nord Light');
	await expect.poll(() => storedScheme(page, id)).toBe('nord-light');

	await page.keyboard.press('Enter');
	await expect(search(page)).toBeFocused();
	await expect(focusedOption(page)).toContainText('Nord Light');
	await expect(focusedOption(page)).toContainText('In use');
});

test('a click uses the scheme and leaves the picker open', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await schemeButton(page).click();
	await search(page).fill('nord');
	await options(page).filter({ hasText: 'Nord Light' }).click();
	await expect.poll(() => storedScheme(page, id)).toBe('nord-light');
	await expect(schemeButton(page)).toHaveAccessibleName('Scheme: Nord Light');
	await expect(search(page)).toBeVisible();
	await expect(focusedOption(page)).toContainText('In use');
	await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00['nord-light']);
});

test('a slide that sets its own scheme keeps it while the picker previews others, and the header says so', async ({
	page
}) => {
	const id = await createDeck(page, ['---\nscheme: gruvbox-dark-hard\n---\n# One', '# Two'], 'nord');
	await openDeck(page, id);
	await schemeButton(page).click();
	const note = page.getByText('This slide sets its own scheme, Gruvbox dark, hard');
	await expect(note).toBeVisible();
	await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00['gruvbox-dark-hard']);
	await page.keyboard.press('ArrowDown');
	await expect(focusedOption(page)).not.toContainText('In use');
	await expect.poll(() => background(previewStage(page))).toBe(base00['gruvbox-dark-hard']);
	await page.keyboard.press('Escape');

	await page
		.getByRole('navigation', { name: 'Slides' })
		.getByRole('button', { name: /^Slide 2/ })
		.click();
	await schemeButton(page).click();
	await expect(page.getByText(/^Previewing on slide 2/)).toBeVisible();
	await expect(note).toBeHidden();
	await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00.nord);
});

test('the dark and light filter, and the list itself, work from the keyboard', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await schemeButton(page).click();
	await page.getByRole('button', { name: 'Light', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('listbox', { name: 'Schemes' }).focus();
	await page.keyboard.press('Home');
	const first = options(page).first();
	await expect(first).toHaveAttribute('aria-selected', 'true');
	await expect(first).toContainText('Light');
	await page.keyboard.press('End');
	await expect(options(page).last()).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press(' ');
	const name = await options(page).last().locator('.label').textContent();
	await expect(schemeButton(page)).toHaveAccessibleName(`Scheme: ${name}`);
});

test('Escape keeps the scheme in use and shows it again', async ({ page }) => {
	const id = await createDeck(page, ['# One'], 'nord');
	await openDeck(page, id);
	await schemeButton(page).click();
	await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00.nord);
	await page.keyboard.press('ArrowDown');
	await expect.poll(() => background(previewStage(page))).not.toBe(base00.nord);
	await page.keyboard.press('Escape');
	await expect(search(page)).toBeHidden();
	expect(await storedScheme(page, id)).toBe('nord');
	await schemeButton(page).click();
	await expect(focusedOption(page)).toContainText('Nord');
	await expect.poll(() => background(previewStage(page))).toBe(base00.nord);
});

test('Escape works from the filters and the Close button too', async ({ page }) => {
	const id = await createDeck(page, ['# One'], 'nord');
	await openDeck(page, id);
	for (const control of ['Dark', 'Close']) {
		await schemeButton(page).click();
		await page.keyboard.press('ArrowDown');
		await page.getByRole('button', { name: control, exact: true }).focus();
		await page.keyboard.press('Escape');
		await expect(search(page)).toBeHidden();
		await expect(schemeButton(page)).toBeFocused();
		await expect(schemeButton(page)).toHaveAccessibleName('Scheme: Nord');
	}
	expect(await storedScheme(page, id)).toBe('nord');
});

test('moving through the schemes repaints the slide without rendering it again', async ({ page }) => {
	const id = await createDeck(page, ['# One\n\nSome text and `code`.']);
	await openDeck(page, id);
	await schemeButton(page).click();
	const slide = page.locator('.preview-body article.slide');
	await expect(slide.locator('h1')).toHaveText('One', { timeout: 30_000 });
	await slide.evaluate((element) => (element.dataset.first = ''));
	const calls = await renderCalls(page);
	const seen = new Set([await background(previewStage(page))]);
	for (let step = 0; step < 4; step++) {
		await page.keyboard.press('ArrowDown');
		await expect.poll(async () => seen.has(await background(previewStage(page)))).toBe(false);
		seen.add(await background(previewStage(page)));
	}
	expect(await renderCalls(page)).toBe(calls);
	await expect(page.locator('.preview-body article.slide[data-first]')).toHaveCount(1);
});

test('a low-contrast scheme keeps its place with a mark, and explains it when focused', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await schemeButton(page).click();
	await page.keyboard.type('tango');
	const tango = options(page).filter({ hasText: 'Tango' });
	await expect(tango).toContainText('Low contrast');
	await expect(tango).toContainText("Body text, muted text or links in Tango can't reach 4.5:1 on its backgrounds.");
	await expect(page.getByText('Low contrast: some text falls below 4.5:1')).toBeVisible();
	await search(page).fill('');
	await expect(page.getByText('375 schemes', { exact: true })).toBeVisible();
	const names = await options(page).locator('.label').allTextContents();
	expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
});

test('the editor preview and thumbnails use the deck scheme, a slide scheme in its place, and the scheme picked', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(
		page,
		['# One', '---\nscheme: gruvbox-dark-hard\n---\n# Two', '---\nscheme: 3\n---\n# Three'],
		'nord'
	);
	await openDeck(page, id);
	const preview = page.getByRole('region', { name: 'Preview' }).locator('.stage');
	const thumbs = page.getByRole('navigation', { name: 'Slides' }).locator('.thumb .stage');
	const warnings = page.getByRole('region', { name: 'Markdown' }).getByRole('status');
	await expect(thumbs).toHaveCount(3);
	await expect(thumbs.nth(2).locator('article.slide h1')).toHaveText('Three', { timeout: 30_000 });
	await expect.poll(() => background(preview)).toBe(base00.nord);
	expect(await Promise.all([0, 1, 2].map((index) => background(thumbs.nth(index))))).toEqual([
		base00.nord,
		base00['gruvbox-dark-hard'],
		base00.nord
	]);

	await page
		.getByRole('navigation', { name: 'Slides' })
		.getByRole('button', { name: /^Slide 3/ })
		.click();
	await expect(warnings).toHaveText("The scheme isn't text, so the slide uses the deck's.");
	await page
		.getByRole('navigation', { name: 'Slides' })
		.getByRole('button', { name: /^Slide 2/ })
		.click();
	await expect.poll(() => background(preview)).toBe(base00['gruvbox-dark-hard']);
	await page
		.getByRole('navigation', { name: 'Slides' })
		.getByRole('button', { name: /^Slide 1/ })
		.click();

	await schemeButton(page).click();
	await expect(page.getByRole('navigation', { name: 'Slides' })).toBeHidden();
	await expect(warnings).toBeHidden();
	await expect(page.locator('.preview-body article.slide h1')).toHaveText('One', { timeout: 30_000 });
	const calls = await renderCalls(page);
	await search(page).fill('nord light');
	await search(page).press('Enter');
	await expect(search(page)).toBeHidden();
	await expect.poll(() => background(preview)).toBe(base00['nord-light']);
	expect(await Promise.all([0, 1, 2].map((index) => background(thumbs.nth(index))))).toEqual([
		base00['nord-light'],
		base00['gruvbox-dark-hard'],
		base00['nord-light']
	]);
	expect(await renderCalls(page)).toBe(calls);
});

test.describe('presenting', () => {
	test('uses the deck scheme, a slide scheme in its place, and the default for an unknown slug', async ({ page }) => {
		const id = await createDeck(
			page,
			['# One', '---\nscheme: gruvbox-dark-hard\n---\n# Two', '---\nscheme: no-such-scheme\n---\n# Three'],
			'nord'
		);
		const stage = page.locator('.presenter .stage');
		await page.goto(`/app/deck/${id}/present#1`);
		await expect(page.locator('article.slide h1')).toHaveText('One', { timeout: 30_000 });
		await expect.poll(() => background(stage)).toBe(base00.nord);
		await page.keyboard.press('ArrowRight');
		await expect(page.locator('article.slide h1')).toHaveText('Two');
		await expect.poll(() => background(stage)).toBe(base00['gruvbox-dark-hard']);
		await page.keyboard.press('ArrowRight');
		await expect(page.locator('article.slide h1')).toHaveText('Three');
		await expect.poll(() => background(stage)).toBe(base00.nord);
	});

	test('falls back to Oxocarbon in the system preference for a missing or unknown scheme', async ({ page }) => {
		const id = await createDeck(page, ['# One'], 'no-such-scheme');
		const stage = page.locator('.presenter .stage');
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto(`/app/deck/${id}/present`);
		await expect(page.locator('article.slide h1')).toHaveText('One', { timeout: 30_000 });
		await expect.poll(() => background(stage)).toBe(base00['oxocarbon-dark']);
		await page.emulateMedia({ colorScheme: 'light' });
		await expect.poll(() => background(stage)).toBe(base00['oxocarbon-light']);
	});
});

test.describe('the app scheme', () => {
	test('is chosen in settings, linked from the editor, and kept in this browser', async ({ page }) => {
		const id = await createDeck(page, ['# One'], 'gruvbox-dark-hard');
		await page.emulateMedia({ colorScheme: 'dark' });
		await openDeck(page, id);
		expect(await rootBackground(page)).toBe(base00['oxocarbon-dark']);
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(page.getByRole('heading', { name: 'App scheme' })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('Previewing the app · Match system')).toBeVisible();
		await expect(focusedOption(page)).toContainText('Match system');
		await expect(focusedOption(page)).toContainText('In use');
		await search(page).fill('nord');
		await search(page).press('ArrowDown');
		await expect(page.getByText('Previewing the app · Nord Light')).toBeVisible();
		expect(await rootBackground(page)).toBe(base00['oxocarbon-dark']);
		await search(page).press('Enter');
		await expect.poll(() => rootBackground(page)).toBe(base00['nord-light']);
		await expect(search(page)).toBeVisible();

		await openDeck(page, id);
		await expect.poll(() => rootBackground(page)).toBe(base00['nord-light']);
		await schemeButton(page).click();
		await expect.poll(() => background(previewStage(page)), { timeout: 30_000 }).toBe(base00['gruvbox-dark-hard']);
	});

	test('Match system clears the chosen scheme and follows the system preference again', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/app/settings');
		await expect(page.getByRole('heading', { name: 'App scheme' })).toBeVisible({ timeout: 30_000 });
		await search(page).fill('nord light');
		await search(page).press('Enter');
		await expect.poll(() => rootBackground(page)).toBe(base00['nord-light']);
		await search(page).fill('');
		await expect(options(page).first()).toContainText('Match system');
		await expect(options(page).first()).not.toContainText('In use');
		await options(page).first().click();
		await expect(options(page).first()).toContainText('In use');
		await expect.poll(() => rootBackground(page)).toBe(base00['oxocarbon-dark']);
		expect(await page.evaluate(() => localStorage.getItem('sld:app-scheme'))).toBeNull();
		await page.emulateMedia({ colorScheme: 'light' });
		await expect.poll(() => rootBackground(page)).toBe(base00['oxocarbon-light']);
		await page.reload();
		await expect(page.getByRole('heading', { name: 'App scheme' })).toBeVisible({ timeout: 30_000 });
		await expect(focusedOption(page)).toContainText('Match system');
	});

	test('follows the system preference until one is chosen', async ({ page }) => {
		await page.goto('/app/settings');
		await expect(page.getByRole('heading', { name: 'App scheme' })).toBeVisible({ timeout: 30_000 });
		await page.emulateMedia({ colorScheme: 'light' });
		await expect.poll(() => rootBackground(page)).toBe(base00['oxocarbon-light']);
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect.poll(() => rootBackground(page)).toBe(base00['oxocarbon-dark']);
	});
});
