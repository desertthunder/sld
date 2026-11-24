import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

// Two pages in one browser context share IndexedDB and the database worker, as two tabs do.

async function createDeck(page: Page, slides: string[]): Promise<string> {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
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

function storedSlides(page: Page, id: string): Promise<string[] | undefined> {
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

async function runSql(page: Page, statement: string) {
	await page.evaluate(
		async ({ urls, statement }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const database = await openDatabase();
			await database.$client.exec(statement);
		},
		{ urls: modules, statement }
	);
}

const slideList = (page: Page) => page.getByRole('navigation', { name: 'Slides' });
const slideItems = (page: Page) => slideList(page).locator('button[data-index]');
const selectedItem = (page: Page) => slideList(page).locator('button[aria-current="true"]');
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const saveState = (page: Page) => page.getByRole('banner').locator('.saved');

async function openDeck(page: Page, id: string, search = '') {
	await page.goto(`/app/deck/${id}${search}`);
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
}

/** Opens the deck in the test's page and in a second tab, and returns both. */
async function openTwice(page: Page, slides: string[], search = ''): Promise<{ id: string; a: Page; b: Page }> {
	const id = await createDeck(page, slides);
	const b = await page.context().newPage();
	await openDeck(page, id);
	await openDeck(b, id, search);
	return { id, a: page, b };
}

// A change counts from the moment its own tab has stored it.
const withinASecond = { timeout: 1000 };

test.beforeEach(async ({ context }) => {
	// These tests read each item's number and heading as its text, which a thumbnail would add to.
	await context.addInitScript(() => localStorage.setItem('sld:slide-list-view', 'headings'));
});

test('a slide added, edited, duplicated or deleted in one tab shows in the other within a second', async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two']);

	await a.getByRole('button', { name: 'New slide' }).click();
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Untitled slide', 'Slide 3 Two'], withinASecond);

	await editor(a).fill('# New');
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 New', 'Slide 3 Two'], withinASecond);

	await a.getByRole('button', { name: 'Duplicate slide 2' }).click();
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 New', 'Slide 3 New', 'Slide 4 Two'], withinASecond);

	await slideItems(a).first().click();
	await a.getByRole('button', { name: 'Delete slide 1' }).click();
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 New', 'Slide 2 New', 'Slide 3 Two'], withinASecond);
	await expect(editor(b)).toHaveText('# New');
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# New', '# New', '# Two']);
});

test('a slide added after the selected one lands right after it, though another tab added one earlier', async ({
	page
}) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two', '# Three'], '?slide=2');

	await a.getByRole('button', { name: 'New slide' }).click();
	await editor(a).fill('# From A');
	await expect(saveState(a)).toHaveText('Saved');
	await expect(selectedItem(b)).toHaveText('Slide 3 Two', withinASecond);
	await expect(b).toHaveURL(/\?slide=3$/);
	await b.getByRole('button', { name: 'New slide' }).click();
	await expect(selectedItem(b)).toHaveText('Slide 4 Untitled slide');
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# One', '# From A', '# Two', '', '# Three']);

	// A write that tells no tab leaves B's list as it was, and B's next slide still follows the one it shows selected.
	await runSql(
		a,
		`UPDATE slides SET position = position + 1 WHERE deck_id = '${id}';
		INSERT INTO slides (deck_id, position, markdown) VALUES ('${id}', 0, '# Zero');`
	);
	await slideItems(b).nth(2).click();
	await expect(selectedItem(b)).toHaveText('Slide 3 Two');
	await b.getByRole('button', { name: 'Duplicate slide 3' }).click();
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# Zero', '# One', '# From A', '# Two', '# Two', '', '# Three']);
});

test("typing not yet stored stays through another tab's changes, and its write then wins", async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two']);
	await runSql(
		b,
		`CREATE OR REPLACE FUNCTION hold_typing() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'held'; END $$ LANGUAGE plpgsql;
		CREATE TRIGGER hold_typing BEFORE UPDATE ON slides FOR EACH ROW WHEN (NEW.markdown LIKE '%unsaved%')
		EXECUTE FUNCTION hold_typing();`
	);
	await editor(b).fill('# One, unsaved');
	await expect(saveState(b)).toHaveText('Not saved');

	await editor(a).fill('# One, from A');
	await expect(saveState(a)).toHaveText('Saved');
	await slideItems(a).nth(1).click();
	await editor(a).fill('# Two, from A');
	await a.getByRole('button', { name: 'New slide' }).click();
	await expect(saveState(a)).toHaveText('Saved');

	await expect(slideItems(b)).toHaveText(
		['Slide 1 One, unsaved', 'Slide 2 Two, from A', 'Slide 3 Untitled slide'],
		withinASecond
	);
	await expect(editor(b)).toHaveText('# One, unsaved');
	expect(await storedSlides(b, id)).toEqual(['# One, from A', '# Two, from A', '']);

	await runSql(b, 'DROP TRIGGER hold_typing ON slides');
	await editor(b).focus();
	await editor(b).blur();
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# One, unsaved', '# Two, from A', '']);
	await expect(slideItems(a)).toHaveText(
		['Slide 1 One, unsaved', 'Slide 2 Two, from A', 'Slide 3 Untitled slide'],
		withinASecond
	);
	expect(await b.evaluate((key) => localStorage.getItem(key), `sld:journal:${id}`)).toBeNull();
});

test("another tab's edit to a slide shown later reaches its editor without joining its undo history", async ({
	page
}) => {
	const { a, b } = await openTwice(page, ['# One', '# Two'], '?slide=2');
	await slideItems(b).first().click();
	await expect(editor(b)).toHaveText('# One');
	await slideItems(b).nth(1).click();

	await editor(a).fill('# One, from A');
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One, from A', 'Slide 2 Two'], withinASecond);
	await slideItems(b).first().click();
	await expect(editor(b)).toHaveText('# One, from A');
	await editor(b).focus();
	await b.keyboard.press('ControlOrMeta+z');
	await expect(editor(b)).toHaveText('# One, from A');
	await expect(saveState(b)).toHaveText('Saved');
});

test('a selected slide another tab deletes gives way to its neighbor, and says so', async ({ page }) => {
	const { a, b } = await openTwice(page, ['# One', '# Two', '# Three'], '?slide=2');
	await slideItems(a).nth(1).click();
	await a.getByRole('button', { name: 'Delete slide 2' }).click();
	await expect(saveState(a)).toHaveText('Saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Three'], withinASecond);
	await expect(selectedItem(b)).toHaveText('Slide 2 Three');
	await expect(editor(b)).toHaveText('# Three');
	await expect(b.getByRole('status').filter({ hasText: 'Slide 2 was deleted in another tab.' })).toBeAttached();
	await expect(saveState(b)).toHaveText('Saved');
});

test('typing on a slide another tab deletes never lands in its neighbor, then or after a reload', async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two', '# Three'], '?slide=2');
	await slideItems(a).nth(1).click();
	await editor(b).click();
	await b.keyboard.press('ControlOrMeta+End');
	const typing = editor(b).pressSequentially(' keep typing after the delete lands', { delay: 80 });
	await a.waitForTimeout(300);
	await a.getByRole('button', { name: 'Delete slide 2' }).click();
	await expect(saveState(a)).toHaveText('Saved');
	await typing;
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Three']);
	await expect(selectedItem(b)).toHaveText('Slide 2 Three');
	await expect(b.getByRole('status').filter({ hasText: 'Slide 2 was deleted in another tab.' })).toBeAttached();
	await expect(editor(b)).toHaveText('# Three');
	await expect(saveState(b)).toHaveText('Not saved');
	await expect(b.getByText('The slide you were typing in was deleted in another tab.')).toBeVisible();
	// Past the saver's delay, so a write of the keys would have landed.
	await b.waitForTimeout(500);
	expect(await storedSlides(b, id)).toEqual(['# One', '# Three']);

	// Escape lets the slide go, and typing then edits it as shown.
	await b.keyboard.press('Escape');
	await b.keyboard.type('Now ');
	await expect(editor(b)).toHaveText('Now # Three');
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# One', 'Now # Three']);

	await b.reload();
	await expect(slideList(b)).toBeVisible({ timeout: 30_000 });
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Now # Three']);
	await expect(editor(b)).toHaveText('Now # Three');
	await expect(saveState(b)).toHaveText('Saved');
	expect(await storedSlides(b, id)).toEqual(['# One', 'Now # Three']);
});

test('a new slide whose slide another tab deleted lands after the one before it, or says it was not saved', async ({
	page
}) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two', '# Three'], '?slide=2');
	// Deleting without a signal leaves B showing slide 2, and holding B's next edit keeps its new slide queued.
	await runSql(
		a,
		`DELETE FROM slides WHERE deck_id = '${id}' AND position = 1;
		UPDATE slides SET position = 1 WHERE deck_id = '${id}' AND position = 2;
		CREATE OR REPLACE FUNCTION hold_slow() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$
		LANGUAGE plpgsql;
		CREATE TRIGGER hold_slow BEFORE UPDATE ON slides FOR EACH ROW WHEN (NEW.markdown LIKE '%slow%')
		EXECUTE FUNCTION hold_slow();`
	);
	await slideItems(b).first().click();
	await editor(b).fill('# One, slow');
	await editor(b).blur();
	await expect(saveState(b)).toHaveText('Saving…');
	await slideItems(b).nth(1).click();
	await b.getByRole('button', { name: 'New slide' }).click();
	await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect(saveState(b)).toHaveText('Saved', { timeout: 5000 });
	await expect(slideItems(b)).toHaveText(['Slide 1 One, slow', 'Slide 2 Untitled slide', 'Slide 3 Three']);
	await expect(selectedItem(b)).toHaveText('Slide 2 Untitled slide');
	expect(await storedSlides(b, id)).toEqual(['# One, slow', '', '# Three']);

	// Written before B hears of the delete, the new slide can't land, and B says so.
	await runSql(
		a,
		`DELETE FROM slides WHERE deck_id = '${id}' AND position = 1;
		UPDATE slides SET position = 1 WHERE deck_id = '${id}' AND position = 2;`
	);
	await b.getByRole('button', { name: 'New slide' }).click();
	await expect(saveState(b)).toHaveText('Not saved');
	await expect(slideItems(b)).toHaveText(['Slide 1 One, slow', 'Slide 2 Three']);
	expect(await storedSlides(b, id)).toEqual(['# One, slow', '# Three']);
});

test('a split not yet written keeps both parts through a catch-up', async ({ page }) => {
	const { id, b } = await openTwice(page, ['# One', '# Last']);
	await runSql(
		b,
		`CREATE OR REPLACE FUNCTION hold_slow() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$
		LANGUAGE plpgsql;
		CREATE TRIGGER hold_slow BEFORE UPDATE ON slides FOR EACH ROW WHEN (NEW.markdown LIKE '%slow%')
		EXECUTE FUNCTION hold_slow();`
	);
	// The catch-up waits behind a slow write, with the split and the typing before it queued after.
	await editor(b).click();
	await b.keyboard.press('ControlOrMeta+End');
	await b.keyboard.type(' slow');
	await editor(b).blur();
	await expect(saveState(b)).toHaveText('Saving…');
	await editor(b).click();
	await b.keyboard.press('ControlOrMeta+End');
	await b.keyboard.press('Enter');
	await b.keyboard.press('Enter');
	await b.keyboard.type('---');
	await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await b.keyboard.press('Enter');
	await b.keyboard.press('Enter');
	await b.keyboard.type('# Two');
	await expect(saveState(b)).toHaveText('Saved', { timeout: 5000 });
	await expect(slideItems(b)).toHaveText(['Slide 1 One slow', 'Slide 2 Two', 'Slide 3 Last']);
	await slideItems(b).first().click();
	await expect(editor(b)).toHaveText('# One slow');
	expect(await storedSlides(b, id)).toEqual(['# One slow', '# Two', '# Last']);
});

test('a change no signal told of shows once the tab shows again', async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One', '# Two']);
	await runSql(a, `UPDATE slides SET markdown = '# Two, quietly' WHERE deck_id = '${id}' AND position = 1`);
	await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Two, quietly'], withinASecond);

	// A page back from the back-forward cache reads the deck again too.
	await runSql(a, `UPDATE slides SET markdown = '# One, quietly' WHERE deck_id = '${id}' AND position = 0`);
	await b.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
	await expect(slideItems(b)).toHaveText(['Slide 1 One, quietly', 'Slide 2 Two, quietly'], withinASecond);
});

test('a hidden tab reads what another tab stored once it shows again', async ({ page }) => {
	const { a, b } = await openTwice(page, ['# One', '# Two']);
	const setHidden = (isHidden: boolean) =>
		b.evaluate((isHidden) => {
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				get: () => (isHidden ? 'hidden' : 'visible')
			});
			document.dispatchEvent(new Event('visibilitychange'));
		}, isHidden);
	await setHidden(true);
	await a.getByRole('button', { name: 'New slide' }).click();
	await expect(slideItems(a)).toHaveCount(3);
	await expect(saveState(a)).toHaveText('Saved');
	await b.waitForTimeout(1000);
	await expect(slideItems(b)).toHaveCount(2);
	await setHidden(false);
	await expect(slideItems(b)).toHaveText(['Slide 1 One', 'Slide 2 Untitled slide', 'Slide 3 Two'], withinASecond);
});

test('a rename, a scheme and deleting the deck in another tab show in the open editor', async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One']);
	await a.getByRole('button', { name: 'Rename deck: Talk' }).click();
	await a.getByRole('textbox', { name: 'Deck title' }).fill('Field notes');
	await a.keyboard.press('Enter');
	await expect(b.getByRole('button', { name: 'Rename deck: Field notes' })).toBeVisible(withinASecond);
	await expect(b).toHaveTitle(/^Field notes · /);

	await a.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { applyDeckChanges } = (await import(urls.decks)) as typeof DecksModule;
			await applyDeckChanges(await openDatabase(), id, [{ kind: 'scheme', scheme: 'nord' }]);
		},
		{ urls: modules, id }
	);
	await expect(b.getByRole('button', { name: /^Scheme: / })).toHaveAccessibleName('Scheme: Nord', withinASecond);

	await a.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { removeDeck } = (await import(urls.decks)) as typeof DecksModule;
			await removeDeck(await openDatabase(), id);
		},
		{ urls: modules, id }
	);
	await expect(b.getByRole('heading', { level: 1, name: 'Deck deleted' })).toBeVisible(withinASecond);
	await expect(b.getByText('Another tab deleted this deck while it was open here.')).toBeVisible();
	await expect(b.getByText(/not yet saved/)).toHaveCount(0);
	await expect(b.getByRole('link', { name: 'Back to decks' })).toHaveAttribute('href', '/app');
});

test('a deck another tab deletes while changes here are not yet saved says they were lost', async ({ page }) => {
	const { id, a, b } = await openTwice(page, ['# One']);
	await runSql(
		b,
		`CREATE OR REPLACE FUNCTION refuse() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'refused'; END $$ LANGUAGE plpgsql;
		CREATE TRIGGER refuse BEFORE UPDATE ON slides FOR EACH ROW WHEN (NEW.markdown LIKE '%refused%')
		EXECUTE FUNCTION refuse();`
	);
	await editor(b).click();
	await b.keyboard.press('ControlOrMeta+End');
	await b.keyboard.type(' refused');
	await expect(saveState(b)).toHaveText('Not saved');
	await a.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { removeDeck } = (await import(urls.decks)) as typeof DecksModule;
			await removeDeck(await openDatabase(), id);
		},
		{ urls: modules, id }
	);
	await expect(b.getByRole('heading', { level: 1, name: 'Deck deleted' })).toBeVisible(withinASecond);
	await expect(b.getByText('Changes made here and not yet saved were lost with it.')).toBeVisible();
});
