import { expect, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import { test } from './deck/page-errors.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

const pasted = '# Talk\n\nIntro\n\n---\n\n## Middle\n\n- One point\n\n---\n\n## End\n';

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openLibrary(page: Page) {
	await page.goto('/app');
	await waitForApp(page);
}

/** Creates decks in the page's database, the last one newest, then reloads the library, and returns their ids. */
async function createDecks(page: Page, decks: { title: string; slides: string[] }[]): Promise<string[]> {
	await openLibrary(page);
	const ids = await page.evaluate(
		async ({ urls, decks }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const database = await openDatabase();
			const ids: string[] = [];
			for (const deck of decks) {
				const { id } = await createDeck(database, deck);
				ids.push(id);
			}
			return ids;
		},
		{ urls: modules, decks }
	);
	await page.reload();
	await waitForApp(page);
	await expect(rows(page)).toHaveCount(decks.length);
	return ids;
}

/** Every stored deck, the most recently changed first, with its slides. */
async function storedDecks(page: Page) {
	return page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { getDeck, listDecks } = (await import(urls.decks)) as typeof DecksModule;
		const database = await openDatabase();
		const decks = await listDecks(database);
		return Promise.all(decks.map(async ({ id }) => (await getDeck(database, id))!));
	}, modules);
}

async function storedTitles(page: Page): Promise<string[]> {
	const decks = await storedDecks(page);
	return decks.map(({ title }) => title);
}

async function storedDeck(page: Page, id: string) {
	const decks = await storedDecks(page);
	return decks.find((deck) => deck.id === id);
}

/** Pastes `text` with the focus on `target`, or on the page itself when there is none. */
async function paste(page: Page, text: string, target = 'body') {
	await page.locator(target).evaluate((element, text) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', text);
		element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
	}, text);
}

const pasteBox = (page: Page) => page.getByRole('textbox', { name: 'New deck' });
const rows = (page: Page) => page.getByRole('region', { name: 'Library' }).getByRole('listitem');
const titles = (page: Page) => rows(page).getByRole('link').and(page.locator('a.title'));
const menuButton = (page: Page, title: string) =>
	page.getByRole('button', { name: `More actions for ${title}`, exact: true });
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name });
const renameField = (page: Page) => page.getByRole('textbox', { name: 'Deck title' });

test('pasting a three-slide document anywhere creates a deck with three slides and opens its editor', async ({
	page
}) => {
	await openLibrary(page);
	await paste(page, pasted);
	await expect(pasteBox(page)).toHaveValue(pasted);
	await expect(pasteBox(page)).toBeFocused();
	await expect(page.getByText('3 slides', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Create deck' }).click();
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}(\?|$)/, { timeout: 20_000 });
	const id = /\/app\/deck\/([\da-f-]{36})/.exec(page.url())![1];
	await expect(page.getByRole('navigation', { name: 'Slides' }).locator('button[data-index]')).toHaveCount(3, {
		timeout: 30_000
	});
	const [deck] = await storedDecks(page);
	expect(deck).toMatchObject({ id, title: 'Talk' });
	expect(deck!.slides.map(({ markdown }) => markdown)).toEqual([
		'# Talk\n\nIntro',
		'## Middle\n\n- One point',
		'## End'
	]);
});

test('Create deck waits for text, and a paste into the rename field stays there', async ({ page }) => {
	await createDecks(page, [{ title: 'Talk', slides: ['# Talk'] }]);
	await expect(page.getByRole('button', { name: 'Create deck' })).toBeDisabled();
	await pasteBox(page).fill('   \n');
	await expect(page.getByRole('button', { name: 'Create deck' })).toBeDisabled();
	await pasteBox(page).fill('---\ntitle: Only frontmatter\n---\n');
	await expect(page.getByText('0 slides', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create deck' })).toBeDisabled();
	await pasteBox(page).fill('');
	await menuButton(page, 'Talk').click();
	await menuItem(page, 'Rename').click();
	await expect(renameField(page)).toBeFocused();
	await paste(page, '# Pasted', 'input[aria-label="Deck title"]');
	await expect(renameField(page)).toBeFocused();
	await expect(pasteBox(page)).toHaveValue('');
});

test('a paste outside a box that holds a draft leaves the draft, and a paste inside goes in', async ({ page }) => {
	await openLibrary(page);
	await pasteBox(page).focus();
	await page.keyboard.type('# My draft');
	await page.getByRole('heading', { name: 'Library' }).focus();
	await paste(page, pasted);
	await expect(pasteBox(page)).toHaveValue('# My draft');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeFocused();
	// The box's own undo history still holds the typing, which a script setting its value would have cleared.
	await pasteBox(page).focus();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(pasteBox(page)).not.toHaveValue('# My draft');
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(pasteBox(page)).toHaveValue('# My draft');
	// A paste into the box itself is the browser's own: the library leaves it alone.
	const isHandled = await pasteBox(page).evaluate((element) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', '# Other');
		const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
		element.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(isHandled).toBe(false);
	await page.getByRole('heading', { name: 'Library' }).focus();
	await pasteBox(page).fill('');
	await paste(page, pasted);
	await expect(pasteBox(page)).toHaveValue(pasted);
});

test('two deletes while the toast shows, then one Undo, put back both decks exactly', async ({ page }) => {
	const ids = await createDecks(page, [
		{ title: 'Field notes', slides: ['# One', '# Two', '# Three'] },
		{ title: 'Reading group', slides: ['# Week 3', '# Week 4'] },
		{ title: 'Standup', slides: ['# Today'] }
	]);
	const before = await storedDecks(page);
	await menuButton(page, 'Field notes').click();
	await menuItem(page, 'Delete').click();
	await expect(page.getByRole('status')).toContainText('Deleted “Field notes”');
	await menuButton(page, 'Reading group').click();
	await menuItem(page, 'Delete').click();
	await expect(titles(page)).toHaveText(['Standup']);
	await expect(page.getByRole('status')).toContainText('Deleted 2 decks');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	const left = await storedDecks(page);
	expect(left.map(({ id }) => id)).toEqual([ids[2]]);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(titles(page)).toHaveText(['Standup', 'Reading group', 'Field notes']);
	await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
	await expect(titles(page).nth(1)).toBeFocused();
	expect(await storedDecks(page)).toEqual(before);
});

test('the library lists decks newest first, and renames, duplicates, deletes and undoes', async ({ page }) => {
	const [first, second] = await createDecks(page, [
		{ title: 'Field notes', slides: ['# One', '# Two', '# Three'] },
		{ title: 'Reading group', slides: ['# Week 3'] }
	]);
	await expect(page.getByText('2 decks', { exact: true })).toBeVisible();
	await expect(titles(page)).toHaveText(['Reading group', 'Field notes']);
	await expect(rows(page).nth(1)).toHaveText(/^\s*3 slides\s*Field notes\s*edited just now\s*$/);
	await expect(rows(page).nth(0)).toHaveText(/^\s*1 slide\s*Reading group\s*edited just now\s*$/);
	await expect(titles(page).nth(1)).toHaveAttribute('href', `/app/deck/${first}`);
	await expect(page.getByRole('link', { name: 'Present Field notes' })).toHaveAttribute(
		'href',
		`/app/deck/${first}/present`
	);

	// Rename: Enter saves, Escape cancels, and an empty title puts the old one back.
	await menuButton(page, 'Field notes').click();
	await menuItem(page, 'Rename').click();
	await renameField(page).fill('Sleep diary');
	await renameField(page).press('Enter');
	await expect(titles(page)).toHaveText(['Sleep diary', 'Reading group']);
	await expect(menuButton(page, 'Sleep diary')).toBeFocused();
	await menuButton(page, 'Sleep diary').click();
	await menuItem(page, 'Rename').click();
	await renameField(page).fill('Not this');
	await renameField(page).press('Escape');
	await menuButton(page, 'Sleep diary').click();
	await menuItem(page, 'Rename').click();
	await renameField(page).fill('  ');
	await renameField(page).press('Enter');
	await expect(titles(page)).toHaveText(['Sleep diary', 'Reading group']);
	expect(await storedTitles(page)).toEqual(['Sleep diary', 'Reading group']);

	// Duplicate makes a copy with the same slides, listed first.
	await menuButton(page, 'Reading group').click();
	await menuItem(page, 'Duplicate').click();
	await expect(titles(page)).toHaveText(['Reading group (copy)', 'Sleep diary', 'Reading group']);
	const [copy] = await storedDecks(page);
	expect(copy!.slides.map(({ markdown }) => markdown)).toEqual(['# Week 3']);
	expect(copy!.id).not.toBe(second);

	// Delete happens at once, and Undo puts back exactly the deck that was there.
	const before = await storedDeck(page, first!);
	expect(before).toBeDefined();
	await menuButton(page, 'Sleep diary').click();
	await menuItem(page, 'Delete').click();
	await expect(titles(page)).toHaveText(['Reading group (copy)', 'Reading group']);
	await expect(page.getByRole('status')).toContainText('Deleted “Sleep diary”');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	expect(await storedDeck(page, first!)).toBeUndefined();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(titles(page)).toHaveText(['Reading group (copy)', 'Sleep diary', 'Reading group']);
	await expect(titles(page).nth(1)).toBeFocused();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
	expect(await storedDeck(page, first!)).toEqual(before);

	// A delete with no undo lasts through a reload.
	await menuButton(page, 'Reading group').click();
	await menuItem(page, 'Delete').click();
	await expect(titles(page)).toHaveText(['Reading group (copy)', 'Sleep diary']);
	await page.reload();
	await waitForApp(page);
	await expect(titles(page)).toHaveText(['Reading group (copy)', 'Sleep diary']);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
]) {
	test(`an open row menu sits above the rows below it at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await createDecks(page, [
			{ title: 'Field notes', slides: ['# One'] },
			{ title: 'Reading group', slides: ['# Two'] },
			{ title: 'Sleep diary', slides: ['# Three'] }
		]);
		await menuButton(page, 'Sleep diary').click();
		const items = page.getByRole('menu', { name: 'More actions for Sleep diary' }).getByRole('menuitem');
		await expect(items).toHaveText(['Rename', 'Duplicate', 'Export as markdown', 'Delete']);
		const all = await items.all();
		for (const item of all) {
			await item.scrollIntoViewIfNeeded();
			// A click lands anywhere on an item, not only at its center where Playwright clicks.
			const hits = await item.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const y = box.top + box.height / 2;
				return [box.left + 4, box.right - 4, box.right - 20].map(
					(x) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]') === element
				);
			});
			expect(hits, (await item.textContent()) ?? '').toEqual([true, true, true]);
		}

		// The hint's code span stays on one line.
		await expect(page.locator('#new-deck-hint code')).toHaveText('---');
		expect(await page.locator('#new-deck-hint code').evaluate((code) => code.getClientRects().length)).toBe(1);
	});
}

test('the list works with the keyboard alone', async ({ page }) => {
	await createDecks(page, [
		{ title: 'Field notes', slides: ['# One'] },
		{ title: 'Reading group', slides: ['# Two'] }
	]);
	// Create deck is disabled while the box is empty, so Tab skips it.
	await pasteBox(page).focus();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Export all decks' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(titles(page).first()).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Present Reading group' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(menuButton(page, 'Reading group')).toBeFocused();

	// The menu opens on its first item, arrows move through it, and Escape closes it and returns focus.
	await page.keyboard.press('Enter');
	await expect(menuItem(page, 'Rename')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(menuItem(page, 'Duplicate')).toBeFocused();
	await page.keyboard.press('End');
	await expect(menuItem(page, 'Delete')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(menuItem(page, 'Rename')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
	await expect(menuButton(page, 'Reading group')).toBeFocused();

	// Rename from the keyboard.
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	await expect(renameField(page)).toBeFocused();
	await page.keyboard.type('Book club');
	await page.keyboard.press('Enter');
	await expect(titles(page)).toHaveText(['Book club', 'Field notes']);
	await expect(menuButton(page, 'Book club')).toBeFocused();

	// Delete from the keyboard, then undo from the toast.
	await page.keyboard.press('ArrowUp');
	await expect(menuItem(page, 'Delete')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(titles(page)).toHaveText(['Field notes']);
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(titles(page)).toHaveText(['Book club', 'Field notes']);
	await expect(titles(page).first()).toBeFocused();

	// Tab moves out of an open menu and closes it.
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menu')).toBeVisible();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('menu')).toBeHidden();
	await expect(titles(page).nth(1)).toBeFocused();

	// Enter on a title opens the deck.
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}/);
});

test('a first visit offers the sample deck, which Open creates and opens', async ({ page }) => {
	await openLibrary(page);
	await expect(page.getByText('sample', { exact: true })).toBeVisible();
	await expect(page.getByText('How to write Markdown')).toBeVisible();
	await expect(page.getByText('6 slides', { exact: true })).toBeVisible();
	await expect(page.getByText('Decks you make are saved here, in this browser.')).toBeVisible();
	await page.getByRole('button', { name: 'Open', exact: true }).click();
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}/, { timeout: 20_000 });
	await expect(page.getByRole('navigation', { name: 'Slides' }).locator('button[data-index]')).toHaveCount(6, {
		timeout: 30_000
	});
	await page.getByRole('link', { name: 'Decks' }).click();
	await waitForApp(page);
	await expect(titles(page)).toHaveText(['How to write Markdown']);
	await expect(rows(page)).toHaveText(/^\s*6 slides\s*How to write Markdown\s*edited just now\s*$/);
});

test('a failed Undo keeps the toast for every deck, and Undo works once the restore can go through', async ({
	page
}) => {
	const [id, otherId] = await createDecks(page, [
		{ title: 'Field notes', slides: ['# One', '# Two'] },
		{ title: 'Reading group', slides: ['# Week 3'] }
	]);
	await menuButton(page, 'Field notes').click();
	await menuItem(page, 'Delete').click();
	await menuButton(page, 'Reading group').click();
	await menuItem(page, 'Delete').click();
	await expect(titles(page)).toHaveCount(0);
	const blocker = async (shouldExist: boolean) =>
		page.evaluate(
			async ({ urls, id, shouldExist }) => {
				const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
				const { createDeck, removeDeck } = (await import(urls.decks)) as typeof DecksModule;
				const database = await openDatabase();
				await (shouldExist ? createDeck(database, { id, title: 'Blocker' }) : removeDeck(database, id));
			},
			{ urls: modules, id: id!, shouldExist }
		);
	// A deck with the same id as one of them makes the restore fail, and restores neither.
	await blocker(true);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('alert')).toContainText("That change couldn't be saved:");
	await expect(page.getByRole('status')).toContainText('Deleted 2 decks');
	await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
	expect(await storedDeck(page, otherId!)).toBeUndefined();
	await blocker(false);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(titles(page)).toHaveText(['Reading group', 'Field notes']);
	await expect(page.getByRole('alert')).toBeHidden();
	const restored = await storedDeck(page, id!);
	expect(restored?.slides.map(({ markdown }) => markdown)).toEqual(['# One', '# Two']);
	const other = await storedDeck(page, otherId!);
	expect(other?.slides.map(({ markdown }) => markdown)).toEqual(['# Week 3']);
});

test('decks that fail to load say so, and the list stops waiting', async ({ page }) => {
	await openLibrary(page);
	await page.evaluate(async (url) => {
		const { openDatabase, writeDurably } = (await import(url)) as typeof DatabaseModule;
		await writeDurably(await openDatabase(), ({ $client }) => $client.exec('drop table slides;'));
	}, modules.database);
	await page.reload();
	await waitForApp(page);
	await expect(page.getByRole('alert')).toContainText("Your decks didn't load:");
	await expect(page.getByRole('region', { name: 'Library' })).not.toHaveAttribute('aria-busy', 'true');
});
