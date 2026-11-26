import { expect, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import { test } from './deck/page-errors.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

const appHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'sld', exact: true });
const homeLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'sld home', exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });

async function openLibrary(page: Page) {
	await page.goto('/app');
	await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
}

async function expectLandingPage(page: Page) {
	await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
	await expect(page.getByRole('heading', { level: 1, name: 'Easy slides from markdown' })).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({ timeout: 30_000 });
}

/** Creates a deck in the page's database and returns its id. */
async function createDeck(page: Page, slides: string[]): Promise<string> {
	await openLibrary(page);
	return page.evaluate(
		async ({ urls, slides }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Talk', slides });
			return deck.id;
		},
		{ urls: modules, slides }
	);
}

async function openDeck(page: Page, id: string) {
	await page.goto(`/app/deck/${id}`);
	await expect(editor(page)).toBeVisible({ timeout: 30_000 });
}

/** Holds the database in an open transaction until the returned function releases it, so writes wait. */
async function holdWrites(page: Page): Promise<() => Promise<void>> {
	await page.evaluate(async (url) => {
		const { openDatabase } = (await import(url)) as typeof DatabaseModule;
		const { $client } = await openDatabase();
		const { promise: held, resolve: hold } = Promise.withResolvers<void>();
		const { promise: release, resolve } = Promise.withResolvers<void>();
		Object.assign(globalThis, { releaseWrites: resolve });
		void $client.transaction(async () => {
			hold();
			await release;
		});
		await held;
	}, modules.database);
	return () => page.evaluate(() => (globalThis as unknown as { releaseWrites: () => void }).releaseWrites());
}

async function storedSlides(page: Page, id: string): Promise<string[] | undefined> {
	return page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await getDeck(await openDatabase(), id);
			return deck?.slides.map(({ markdown }) => markdown);
		},
		{ urls: modules, id }
	);
}

test('the library heading still reads "sld", and the mark beside it links home as "sld home"', async ({ page }) => {
	await openLibrary(page);
	await expect(appHeading(page)).toHaveText('sld');
	await expect(homeLink(page)).toHaveAttribute('href', '/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('clicking the mark in the library header opens the landing page', async ({ page }) => {
	await openLibrary(page);
	await homeLink(page).click();
	await expectLandingPage(page);
});

test('Enter on the mark in the library header opens the landing page, after a focus ring shows', async ({ page }) => {
	await openLibrary(page);
	await page.keyboard.press('Tab');
	await expect(homeLink(page)).toBeFocused();
	await expect(homeLink(page)).toHaveCSS('outline-style', 'solid');
	await page.keyboard.press('Enter');
	await expectLandingPage(page);
});

test('the library footer links to the landing page in words', async ({ page }) => {
	await openLibrary(page);
	const link = page.getByRole('contentinfo').getByRole('link', { name: 'Home page', exact: true });
	await expect(link).toBeVisible();
	await link.click();
	await expectLandingPage(page);
});

test('clicking the mark in the editor header opens the landing page', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await homeLink(page).click();
	await expectLandingPage(page);
});

test('Enter on the mark in the editor header opens the landing page', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await homeLink(page).focus();
	await expect(homeLink(page)).toHaveCSS('outline-style', 'solid');
	await page.keyboard.press('Enter');
	await expectLandingPage(page);
});

test('the mark in the editor waits for the latest edit to be stored before it leaves', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	const release = await holdWrites(page);
	await editor(page).fill('# One, edited');
	await homeLink(page).click();
	await expect(page.getByRole('banner').locator('.saved')).toHaveText('Saving…');
	// The hold lasts until the release, so this wait can only give a link that leaves too soon the time to show it.
	await page.waitForTimeout(1000);
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}`));
	await release();
	await expectLandingPage(page);
	expect(await storedSlides(page, id)).toEqual(['# One, edited']);
});

test('the settings header links home with the mark too', async ({ page }) => {
	await page.goto('/app/settings');
	await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 30_000 });
	await homeLink(page).click();
	await expectLandingPage(page);
});

async function expectToolbarFits(page: Page, width: number) {
	const toolbar = page.getByRole('banner');
	await expect(toolbar.getByRole('link', { name: 'Decks', exact: true })).toBeVisible();
	expect(await toolbar.evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
	const settings = await toolbar.getByRole('link', { name: 'Settings' }).boundingBox();
	expect(settings!.x + settings!.width).toBeLessThanOrEqual(width);
}

test('at 390 px the editor toolbar fits the mark, Settings and some of the deck title', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await expectToolbarFits(page, 390);
	const title = page.getByRole('button', { name: 'Rename deck: Talk' }).locator('.text');
	expect(await title.evaluate((text) => text.getBoundingClientRect().width)).toBeGreaterThan(20);
});

test('at 320 px the editor toolbar keeps Settings on screen beside the mark', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 800 });
	const id = await createDeck(page, ['# One']);
	await openDeck(page, id);
	await expectToolbarFits(page, 320);
});
