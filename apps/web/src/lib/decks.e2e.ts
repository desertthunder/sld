import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

test('a deck and an edit to its slide survive an immediate reload', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	const id = await page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { createDeck, getDeck, updateSlide } = (await import(urls.decks)) as typeof DecksModule;
		const database = await openDatabase();
		const deck = await createDeck(database, { title: 'Talk', slides: ['# One', '# Two'] });
		const { slides } = (await getDeck(database, deck.id))!;
		await updateSlide(database, slides[1]!.id, '# Two, edited');
		return deck.id;
	}, modules);
	await page.reload();
	await waitForApp(page);
	const deck = await page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await getDeck(await openDatabase(), id);
			return { title: deck?.title, slides: deck?.slides.map(({ markdown }) => markdown) };
		},
		{ urls: modules, id }
	);
	expect(deck).toEqual({ title: 'Talk', slides: ['# One', '# Two, edited'] });
});
