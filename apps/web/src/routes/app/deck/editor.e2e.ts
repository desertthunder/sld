import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Creates a deck in the page's database and returns its id. */
async function createDeck(page: Page, title: string, slides: string[]): Promise<string> {
	await page.goto('/app');
	await waitForApp(page);
	return page.evaluate(
		async ({ urls, title, slides }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title, slides });
			return deck.id;
		},
		{ urls: modules, title, slides }
	);
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

const slideList = (page: Page) => page.getByRole('navigation', { name: 'Slides' });
const slideItems = (page: Page) => slideList(page).locator('button[data-index]');
const selectedItem = (page: Page) => slideList(page).locator('button[aria-current="true"]');
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const saveState = (page: Page) => page.getByRole('banner').locator('.saved');
const leaveDialog = (page: Page) => page.getByRole('dialog', { name: "Some changes weren't saved. Leave anyway?" });

async function openDeck(page: Page, id: string, search = '') {
	await page.goto(`/app/deck/${id}${search}`);
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
}

test('selecting a slide puts it in the URL, and a reload keeps it', async ({ page }) => {
	const id = await createDeck(page, 'Field notes', ['# One', '# Two', '# Three']);
	await openDeck(page, id);
	await expect(page).toHaveURL(/\?slide=1$/);
	await expect(slideItems(page)).toHaveText(['Slide 1 One', 'Slide 2 Two', 'Slide 3 Three']);
	await slideItems(page).nth(2).click();
	await expect(page).toHaveURL(/\?slide=3$/);
	await expect(editor(page)).toHaveText('# Three');
	await page.reload();
	await expect(selectedItem(page)).toHaveText('Slide 3 Three', { timeout: 30_000 });
	await expect(editor(page)).toHaveText('# Three');
});

test('an out-of-range slide number selects the nearest slide', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id, '?slide=9');
	await expect(selectedItem(page)).toHaveText('Slide 2 Two');
	await expect(page).toHaveURL(/\?slide=2$/);
	await openDeck(page, id, '?slide=junk');
	await expect(selectedItem(page)).toHaveText('Slide 1 One');
});

test('an edit that shows Saved survives a reload', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id, '?slide=2');
	await editor(page).fill('# Two, edited');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.reload();
	await expect(editor(page)).toHaveText('# Two, edited', { timeout: 30_000 });
	await expect(selectedItem(page)).toHaveText('Slide 2 Two, edited');
});

test('adds, duplicates and deletes slides from buttons and keys', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two', '# Three']);
	await openDeck(page, id, '?slide=2');

	await page.getByRole('button', { name: 'New slide' }).click();
	await expect(slideItems(page)).toHaveCount(4);
	await expect(selectedItem(page)).toHaveText('Slide 3 Untitled slide');
	await expect(page).toHaveURL(/\?slide=3$/);
	await expect(page.getByRole('status').filter({ hasText: 'Added slide 3.' })).toBeAttached();

	await page.getByRole('button', { name: 'Delete slide 3' }).click();
	await expect(slideItems(page)).toHaveCount(3);
	await expect(selectedItem(page)).toHaveText('Slide 3 Three');

	await page.getByRole('button', { name: 'Duplicate slide 3' }).click();
	await expect(slideItems(page)).toHaveCount(4);
	await expect(selectedItem(page)).toHaveText('Slide 4 Three');
	await expect(selectedItem(page)).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(selectedItem(page)).toHaveText('Slide 3 Three');
	await page.keyboard.press('d');
	await expect(slideItems(page)).toHaveCount(5);
	await page.keyboard.press('n');
	await expect(slideItems(page)).toHaveCount(6);
	await expect(selectedItem(page)).toHaveText('Slide 5 Untitled slide');
	await page.keyboard.press('Delete');
	await expect(slideItems(page)).toHaveCount(5);
	await expect(selectedItem(page)).toBeFocused();
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One', '# Two', '# Three', '# Three', '# Three']);
});

test('three quick presses of N add three slides, and a reload shows them all', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await page.keyboard.press('n');
	await page.keyboard.press('n');
	await expect(slideItems(page)).toHaveCount(4);
	await expect(selectedItem(page)).toHaveText('Slide 4 Untitled slide');
	await expect(saveState(page)).toHaveText('Saved');
	await page.reload();
	await expect(slideItems(page)).toHaveText(
		['Slide 1 One', 'Slide 2 Untitled slide', 'Slide 3 Untitled slide', 'Slide 4 Untitled slide'],
		{ timeout: 30_000 }
	);
});

/** Holds the database's transaction lock, so every write waits, until the returned function lets it go. */
async function holdWrites(page: Page): Promise<() => Promise<void>> {
	await page.evaluate(
		async ({ urls }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const database = await openDatabase();
			const { promise: held, resolve: hold } = Promise.withResolvers<void>();
			const { promise: release, resolve } = Promise.withResolvers<void>();
			Object.assign(globalThis, { releaseWrites: resolve });
			void database.$client.transaction(async () => {
				hold();
				await release;
			});
			await held;
		},
		{ urls: modules }
	);
	return () => page.evaluate(() => (globalThis as unknown as { releaseWrites: () => void }).releaseWrites());
}

test('the list changes at once and the changes save in order after it', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	const release = await holdWrites(page);
	await page.getByRole('button', { name: 'New slide' }).click();
	await expect(slideItems(page)).toHaveText(['Slide 1 One', 'Slide 2 Untitled slide', 'Slide 3 Two']);
	await expect(page.getByRole('status').filter({ hasText: 'Added slide 2.' })).toBeAttached();
	await expect(saveState(page)).toHaveText('Saving…');
	await editor(page).fill('# New');
	await page.getByRole('button', { name: 'Duplicate slide 2' }).click();
	await expect(selectedItem(page)).toHaveText('Slide 3 New');
	await slideItems(page).first().click();
	await page.getByRole('button', { name: 'Delete slide 1' }).click();
	await expect(slideItems(page)).toHaveText(['Slide 1 New', 'Slide 2 New', 'Slide 3 Two']);
	await expect(saveState(page)).toHaveText('Saving…');
	await release();
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# New', '# New', '# Two']);
});

test('a change that fails shows Not saved, and the list goes back to what is stored', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	await breakSlideWrites(page);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await page.keyboard.press('n');
	await page.keyboard.press('d');
	await expect(saveState(page)).toHaveText('Not saved');
	await expect(slideItems(page)).toHaveText(['Slide 1 One', 'Slide 2 Two']);
	await restoreSlideWrites(page);
	expect(await storedSlides(page, id)).toEqual(['# One', '# Two']);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await expect(saveState(page)).toHaveText('Saved');
	await page.reload();
	await expect(slideItems(page)).toHaveCount(3, { timeout: 30_000 });
	expect(await storedSlides(page, id)).toHaveLength(3);
});

test('keys typed in the editor do not reach the slide list', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	await editor(page).fill('');
	await editor(page).pressSequentially('nd');
	await expect(editor(page)).toHaveText('nd');
	await expect(slideItems(page)).toHaveText(['Slide 1 nd', 'Slide 2 Two']);
});

test('switching slides and coming back keeps the text and its undo history', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' and more');
	await slideItems(page).nth(1).click();
	await expect(editor(page)).toHaveText('# Two');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('!');
	await slideItems(page).nth(0).click();
	await expect(editor(page)).toHaveText('# One and more');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(editor(page)).toHaveText('# One');
	await slideItems(page).nth(1).click();
	await expect(editor(page)).toHaveText('# Two!');
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One', '# Two!']);
});

test('hiding the page writes the typing at once, without waiting for a pause', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' and more');
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	// The read waits behind the write the page started, and would come back before a write waiting for a pause.
	expect(await storedSlides(page, id)).toEqual(['# One and more']);
});

test('Enter after a --- line offers to split the slide, and Enter again splits it', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Last']);
	await openDeck(page, id);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	await page.keyboard.type('---');
	await page.keyboard.press('Enter');
	const offer = page.getByRole('group', { name: 'Split slide' });
	await expect(offer).toHaveText(
		/^Split into two slides here\? The lines below become slide 2\.\s*Split\s*Enter\s*Keep as a rule\s*Esc$/
	);
	await page.keyboard.press('Enter');
	await expect(offer).toBeHidden();
	await expect(slideItems(page)).toHaveText(['Slide 1 One', 'Slide 2 Untitled slide', 'Slide 3 Last']);
	await expect(selectedItem(page)).toHaveText(/^Slide 2/);
	await expect(editor(page)).toBeFocused();
	await page.keyboard.type('# Two');
	await expect(slideItems(page)).toHaveText(['Slide 1 One', 'Slide 2 Two', 'Slide 3 Last']);
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One', '# Two', '# Last']);
	await slideItems(page).nth(0).click();
	await expect(editor(page)).toHaveText('# One');
});

test('keeping the --- as a rule closes the offer and adds the new line', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('---');
	await page.keyboard.press('Enter');
	const offer = page.getByRole('group', { name: 'Split slide' });
	await offer.getByRole('button', { name: 'Keep as a rule' }).click();
	await expect(offer).toBeHidden();
	await page.keyboard.type('More');
	await expect(editor(page)).toHaveText('# One---More');
	await expect(slideItems(page)).toHaveCount(1);
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One\n---\nMore']);
});

test('the editor colors its markdown with the scheme variables', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One\n\n[link](https://example.com)']);
	await openDeck(page, id);
	await expect(editor(page)).toBeVisible();
	await page.evaluate(() => {
		document.documentElement.style.setProperty('--heading', 'rgb(1, 2, 3)');
		document.documentElement.style.setProperty('--link', 'rgb(4, 5, 6)');
	});
	await expect(editor(page).getByText('One', { exact: true })).toHaveCSS('color', 'rgb(1, 2, 3)');
	await expect(editor(page).getByText('link', { exact: true })).toHaveCSS('color', 'rgb(4, 5, 6)');
});

test('deleting the selected slide selects its neighbor, and the last slide stays', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two', '# Three']);
	await openDeck(page, id, '?slide=3');
	await page.getByRole('button', { name: 'Delete slide 3' }).click();
	await expect(selectedItem(page)).toHaveText('Slide 2 Two');
	await page.getByRole('button', { name: 'Delete slide 2' }).click();
	await expect(selectedItem(page)).toHaveText('Slide 1 One');
	await expect(page.getByRole('button', { name: 'Delete slide 1' })).toBeDisabled();
	await selectedItem(page).focus();
	await page.keyboard.press('Delete');
	await expect(slideItems(page)).toHaveCount(1);
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One']);
});

test('a change another tab already made shows instead of failing quietly', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	await page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { deleteSlide, getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const database = await openDatabase();
			const deck = await getDeck(database, id);
			await deleteSlide(database, deck!.slides[1]!.id);
		},
		{ urls: modules, id }
	);
	await page.getByRole('button', { name: 'Delete slide 1' }).click();
	await expect(slideItems(page)).toHaveText(['Slide 1 One']);
	await expect(page.getByRole('button', { name: 'Delete slide 1' })).toBeDisabled();
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One']);
});

test('a change dropped because another tab changed the deck shows Not saved', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id, '?slide=2');
	await page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { deleteSlide, getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const database = await openDatabase();
			const deck = await getDeck(database, id);
			await deleteSlide(database, deck!.slides[1]!.id);
		},
		{ urls: modules, id }
	);
	await editor(page).fill('# Gone');
	await page.getByRole('button', { name: 'New slide' }).click();
	await expect(saveState(page)).toHaveText('Not saved');
	await expect(slideItems(page)).toHaveText(['Slide 1 One']);
	expect(await storedSlides(page, id)).toEqual(['# One']);
});

test('an edit to a slide another tab deleted shows what is stored', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id, '?slide=2');
	await page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { deleteSlide, getDeck } = (await import(urls.decks)) as typeof DecksModule;
			const database = await openDatabase();
			const deck = await getDeck(database, id);
			await deleteSlide(database, deck!.slides[1]!.id);
		},
		{ urls: modules, id }
	);
	await editor(page).fill('# Two, edited');
	await expect(slideItems(page)).toHaveText(['Slide 1 One']);
	await expect(editor(page)).toHaveText('# One');
	await expect(saveState(page)).toHaveText('Not saved');
});

test('typing in a slide whose insert fails stays Not saved', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'INSERT');
	const release = await holdWrites(page);
	await page.getByRole('button', { name: 'New slide' }).click();
	await editor(page).fill('# Typed');
	await editor(page).blur();
	await release();
	await expect(slideItems(page)).toHaveText(['Slide 1 One']);
	await expect(saveState(page)).toHaveText('Not saved');
	expect(await storedSlides(page, id)).toEqual(['# One']);
	await expect(saveState(page)).toHaveText('Not saved');
});

test('a copy stores the markdown it shows, even when the edit before it failed', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'UPDATE');
	await editor(page).fill('# Edited');
	await page.getByRole('button', { name: 'Duplicate slide 1' }).click();
	await expect(slideItems(page)).toHaveText(['Slide 1 Edited', 'Slide 2 Edited']);
	await expect.poll(() => storedSlides(page, id)).toEqual(['# One', '# Edited']);
	await runSql(page, 'DROP TRIGGER fail_slide_writes ON slides');
	await editor(page).focus();
	await editor(page).blur();
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# Edited', '# Edited']);
});

test('a change that fails while leaving the deck leaves the URL alone', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'INSERT');
	const release = await holdWrites(page);
	await page.getByRole('button', { name: 'New slide' }).click();
	await page.getByRole('link', { name: /Decks/ }).click();
	await page.waitForTimeout(300);
	await expect(page).toHaveURL(/\/app\/deck\//);
	await release();
	await leaveDialog(page).getByRole('button', { name: 'Leave' }).click();
	await expect(page).toHaveURL(/\/app$/);
	// Each read waits behind the failed insert and the read-back it would start.
	await storedSlides(page, id);
	await storedSlides(page, id);
	await page.waitForTimeout(500);
	await expect(page).toHaveURL(/\/app$/);
});

test('after a batch with a new slide fails, the next change saves', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'INSERT');
	const release = await holdWrites(page);
	await editor(page).fill('# One, edited');
	await expect(saveState(page)).toHaveText('Saving…');
	await page.waitForTimeout(600);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await editor(page).fill('# Typed');
	await page.getByRole('button', { name: 'New slide' }).click();
	await release();
	await expect(saveState(page)).toHaveText('Not saved');
	await expect(slideItems(page)).toHaveText(['Slide 1 One, edited']);
	await runSql(page, 'DROP TRIGGER fail_slide_writes ON slides');
	await page.getByRole('button', { name: 'New slide' }).click();
	await expect(slideItems(page)).toHaveCount(2);
	await expect(saveState(page)).toHaveText('Saved');
	expect(await storedSlides(page, id)).toEqual(['# One, edited', '']);
});

test('going back while a link waits for the changes stays where back went', async ({ page }) => {
	const first = await createDeck(page, 'First', ['# First']);
	const second = await createDeck(page, 'Second', ['# Second']);
	await openDeck(page, first);
	await page.evaluate((id) => {
		const link = document.createElement('a');
		link.href = `/app/deck/${id}`;
		link.id = 'to-second';
		document.body.append(link);
	}, second);
	await page.locator('#to-second').dispatchEvent('click');
	await expect(editor(page)).toHaveText('# Second');
	const release = await holdWrites(page);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await page.getByRole('link', { name: /Decks/ }).click();
	await page.waitForTimeout(300);
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(first));
	await release();
	expect(await storedSlides(page, second)).toEqual(['# Second', '']);
	await page.waitForTimeout(500);
	await expect(page).toHaveURL(new RegExp(first));
});

test('going to the deck list waits for the changes to be stored first', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	const release = await holdWrites(page);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await page.keyboard.press('n');
	await page.getByRole('link', { name: /Decks/ }).click();
	await page.waitForTimeout(300);
	await expect(page).toHaveURL(/\/app\/deck\//);
	await release();
	await expect(page).toHaveURL(/\/app$/);
	expect(await storedSlides(page, id)).toEqual(['# One', '', '']);
});

test('a link that cannot store the changes first asks, and Stay keeps the editor as it is', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'UPDATE');
	await editor(page).fill('# One, edited');
	const decks = page.getByRole('link', { name: /Decks/ });
	await decks.click();
	await expect(leaveDialog(page)).toBeVisible();
	await expect(leaveDialog(page)).toHaveText(/^\s*Some changes weren't saved\. Leave anyway\?\s*Leave\s*Stay\s*$/);
	await expect(leaveDialog(page).getByRole('button', { name: 'Stay' })).toBeFocused();
	await leaveDialog(page).getByRole('button', { name: 'Stay' }).click();
	await expect(leaveDialog(page)).toBeHidden();
	await expect(decks).toBeFocused();
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}`));
	await expect(saveState(page)).toHaveText('Not saved');
	await expect(editor(page)).toHaveText('# One, edited');
	await decks.click();
	await expect(leaveDialog(page)).toBeVisible();
	await leaveDialog(page).getByRole('button', { name: 'Leave' }).click();
	await expect(page).toHaveURL(/\/app$/);
	expect(await storedSlides(page, id)).toEqual(['# One']);
});

test('Present and P ask the same when the changes cannot be stored, and Escape stays', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await failSlideWrites(page, 'UPDATE');
	await editor(page).fill('# One, edited');
	const present = page.getByRole('button', { name: /Present/ });
	await present.click();
	await expect(leaveDialog(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(leaveDialog(page)).toBeHidden();
	await expect(present).toBeFocused();
	await expect(page).toHaveURL(/\?slide=1$/);
	await expect(saveState(page)).toHaveText('Not saved');
	await selectedItem(page).focus();
	await page.keyboard.press('p');
	await expect(leaveDialog(page)).toBeVisible();
	await page.keyboard.press('p');
	await expect(page).toHaveURL(/\?slide=1$/);
	await leaveDialog(page).getByRole('button', { name: 'Leave' }).click();
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}/present#1$`));
});

test('twenty quick presses of N save within seconds, and a reload shows them all', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await selectedItem(page).focus();
	const started = Date.now();
	for (let press = 0; press < 20; press++) await page.keyboard.press('n');
	await expect(slideItems(page)).toHaveCount(21);
	await expect(saveState(page)).toHaveText('Saved', { timeout: 5000 });
	expect(Date.now() - started).toBeLessThan(5000);
	await page.reload();
	await expect(slideItems(page)).toHaveCount(21, { timeout: 30_000 });
	expect(await storedSlides(page, id)).toHaveLength(21);
});

/** Whether a `beforeunload` listener on the page would ask before leaving. */
function doesAskBeforeLeaving(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const event = new Event('beforeunload', { cancelable: true });
		dispatchEvent(event);
		return event.defaultPrevented;
	});
}

test('the page asks before leaving only while a change is not stored', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	expect(await doesAskBeforeLeaving(page)).toBe(false);
	const release = await holdWrites(page);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await expect(saveState(page)).toHaveText('Saving…');
	expect(await doesAskBeforeLeaving(page)).toBe(true);
	await release();
	await expect(saveState(page)).toHaveText('Saved');
	expect(await doesAskBeforeLeaving(page)).toBe(false);
	const dialogs: string[] = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.type());
		void dialog.dismiss();
	});
	await page.close({ runBeforeUnload: true });
	await expect.poll(() => page.isClosed()).toBe(true);
	expect(dialogs).toEqual([]);
});

test('closing the page while a change is saving shows the browser prompt', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await holdWrites(page);
	await selectedItem(page).focus();
	await page.keyboard.press('n');
	await expect(saveState(page)).toHaveText('Saving…');
	const asked = page.waitForEvent('dialog');
	await page.close({ runBeforeUnload: true });
	const dialog = await asked;
	expect(dialog.type()).toBe('beforeunload');
	await dialog.accept();
});

test('saving the title by clicking away leaves focus where it went', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await page.getByRole('button', { name: 'Rename deck: Talk' }).click();
	await page.getByRole('textbox', { name: 'Deck title' }).fill('Field notes');
	await editor(page).click();
	await page.keyboard.type(' and more');
	await expect(editor(page)).toHaveText('# One and more');
	await expect(page.getByRole('button', { name: 'Rename deck: Field notes' })).toBeVisible();
});

test('the deck title edits in place', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await page.getByRole('button', { name: 'Rename deck: Talk' }).click();
	const field = page.getByRole('textbox', { name: 'Deck title' });
	await field.fill('Field notes on sleep');
	await field.press('Enter');
	await expect(page.getByRole('button', { name: 'Rename deck: Field notes on sleep' })).toBeFocused();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Rename deck: Field notes on sleep' })).toBeVisible({
		timeout: 30_000
	});
	await page.getByRole('button', { name: 'Rename deck: Field notes on sleep' }).click();
	await page.getByRole('textbox', { name: 'Deck title' }).fill('Discarded');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Rename deck: Field notes on sleep' })).toBeVisible();
});

test('Present and the P key open the presenter on the selected slide, with the latest edit', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two', '# Three']);
	await openDeck(page, id, '?slide=2');
	await page.getByRole('textbox', { name: /Markdown for slide/ }).fill('# Two, edited');
	await page.getByRole('button', { name: /Present/ }).click();
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}/present#2$`));
	await expect(page.locator('article.slide h1')).toHaveText('Two, edited', { timeout: 30_000 });
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\?slide=2$/);
	await slideList(page)
		.getByRole('button', { name: /Slide 3/ })
		.click();
	await page.keyboard.press('p');
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}/present#3$`));
});

test('Present waits for the latest edit to be stored before it leaves the editor', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await page.evaluate(async (url) => {
		const { openDatabase } = (await import(url)) as typeof DatabaseModule;
		const { $client } = await openDatabase();
		// Holds the database, so the edit's write waits until the transaction ends.
		void $client.transaction(() => new Promise((resolve) => setTimeout(resolve, 3000)));
	}, modules.database);
	await editor(page).fill('# One, edited');
	await page.getByRole('button', { name: /Present/ }).click();
	await page.waitForTimeout(1500);
	await expect(page).toHaveURL(/\?slide=1$/);
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}/present#1$`), { timeout: 30_000 });
	await expect(page.locator('article.slide h1')).toHaveText('One, edited', { timeout: 30_000 });
});

test('P typed in the markdown stays text', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	const markdown = page.getByRole('textbox', { name: /Markdown for slide/ });
	await markdown.fill('# One');
	await markdown.press('End');
	await markdown.press('p');
	await expect(markdown).toHaveText('# Onep');
	await expect(page).toHaveURL(/\?slide=1$/);
});

test('toolbar icons sit beside their text and stay hidden from assistive technology', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	const toolbar = page.getByRole('banner');
	const controls = [
		page.getByRole('link', { name: 'Decks', exact: true }),
		page.getByRole('button', { name: 'Rename deck: Talk' }),
		toolbar.locator('.saved'),
		page.getByRole('button', { name: /Present/ })
	];
	for (const control of controls) {
		const icon = control.locator('[class*="i-ri-"]');
		await expect(icon).toHaveCount(1);
		await expect(icon).toBeVisible();
		await expect(icon).toHaveAttribute('aria-hidden', 'true');
	}
	await expect(page.getByRole('link', { name: 'Decks', exact: true })).toHaveText('Decks');
	await expect(page.getByRole('button', { name: 'Rename deck: Talk' })).toHaveText('Talk');
	await expect(toolbar.locator('.saved')).toHaveText('Saved');
	await expect(page.getByRole('button', { name: /Present/ })).toHaveText('PresentP');
});

test('pane widths persist across a reload', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	const handle = page.getByRole('separator', { name: 'Resize slide list' });
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 100);
	await page.mouse.down();
	await page.mouse.move(box.x + 120, box.y + 100, { steps: 5 });
	await page.mouse.up();
	const listWidth = await slideList(page).evaluate((list) => Math.round(list.getBoundingClientRect().width));
	expect(listWidth).toBeGreaterThan(300);

	const second = page.getByRole('separator', { name: 'Resize editor and preview' });
	await second.focus();
	await page.keyboard.press('End');
	await expect(second).toHaveAttribute('aria-valuenow', '80');

	await page.reload();
	await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
	expect(await slideList(page).evaluate((list) => Math.round(list.getBoundingClientRect().width))).toBe(listWidth);
	await expect(page.getByRole('separator', { name: 'Resize editor and preview' })).toHaveAttribute(
		'aria-valuenow',
		'80'
	);
});

test('an unknown deck shows the not-found state', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-deck']) {
		await page.goto(`/app/deck/${id}`);
		await expect(page.getByRole('heading', { level: 1, name: 'Deck not found' })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('link', { name: 'Back to decks' })).toHaveAttribute('href', '/app');
	}
});

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

/** Makes every later slide write fail, by moving the slides table out of the way. */
function breakSlideWrites(page: Page) {
	return runSql(page, 'ALTER TABLE slides RENAME TO slides_away');
}

/** Makes every later slide `INSERT` or `UPDATE` fail, until the `fail_slide_writes` trigger is dropped. */
function failSlideWrites(page: Page, write: 'INSERT' | 'UPDATE') {
	return runSql(
		page,
		`CREATE OR REPLACE FUNCTION fail_slide_writes() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'no'; END $$ LANGUAGE plpgsql;
		CREATE TRIGGER fail_slide_writes BEFORE ${write} ON slides FOR EACH ROW EXECUTE FUNCTION fail_slide_writes();`
	);
}

/** Puts the slides table back after `breakSlideWrites`. */
function restoreSlideWrites(page: Page) {
	return runSql(page, 'ALTER TABLE slides_away RENAME TO slides');
}

test('the saving icon spins only when motion is welcome', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	const animation = async () => {
		await editor(page).press('End');
		await page.keyboard.type('!');
		await expect(saveState(page)).toHaveText('Saving…');
		return saveState(page)
			.locator('.i-ri-loader-4-line')
			.evaluate((icon) => getComputedStyle(icon).animationName);
	};
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	expect(await animation()).not.toBe('none');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await animation()).toBe('none');
});

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
	return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test.describe('at phone width', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the panes become tabs, with no horizontal scroll, and the chosen tab survives a reload', async ({ page }) => {
		const long = 'A deck title long enough to overflow the toolbar on a phone held upright';
		const id = await createDeck(page, long, ['# One', `# ${'Very long heading '.repeat(6)}`, '# Three']);
		await page.goto(`/app/deck/${id}`);
		const tabs = page.getByRole('tablist', { name: 'Editor panes' });
		await expect(tabs).toBeVisible({ timeout: 30_000 });
		await expect(tabs.getByRole('tab')).toHaveText(['Slides', 'Edit', 'Preview']);
		await expect(tabs.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
		await expect(editor(page)).toBeVisible();
		await expect(slideList(page)).toBeHidden();
		expect(await hasNoHorizontalScroll(page)).toBe(true);
		const title = page.getByRole('button', { name: `Rename deck: ${long}` });
		const pencil = title.locator('.i-ri-pencil-line');
		await expect(pencil).toBeVisible();
		const pencilBox = await pencil.boundingBox();
		const titleBox = await title.boundingBox();
		expect(pencilBox!.x + pencilBox!.width).toBeLessThanOrEqual(titleBox!.x + titleBox!.width);
		expect(await title.locator('.text').evaluate((text) => text.scrollWidth > text.clientWidth)).toBe(true);

		await tabs.getByRole('tab', { name: 'Slides' }).click();
		await expect(slideList(page)).toBeVisible();
		await expect(editor(page)).toBeHidden();
		expect(await hasNoHorizontalScroll(page)).toBe(true);

		await page.reload();
		await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('tab', { name: 'Slides' })).toHaveAttribute('aria-selected', 'true');

		await slideItems(page).nth(1).click();
		await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
		await expect(editor(page)).toHaveText(/^# Very long heading/);
		expect(await hasNoHorizontalScroll(page)).toBe(true);

		await page.getByRole('tab', { name: 'Preview' }).click();
		await expect(page.getByRole('tabpanel', { name: 'Preview' })).toBeVisible();
		await page.setViewportSize({ width: 844, height: 390 });
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
		expect(await hasNoHorizontalScroll(page)).toBe(true);
	});

	test('the save state shows only when a write fails, with its warning icon', async ({ page }) => {
		const id = await createDeck(page, 'A deck title long enough to overflow the toolbar on a phone held upright', [
			'# One'
		]);
		await page.goto(`/app/deck/${id}`);
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
		await expect(saveState(page)).toHaveText('Saved');
		await expect(saveState(page)).toBeHidden();
		await breakSlideWrites(page);
		await editor(page).fill('# One, edited');
		await expect(saveState(page)).toHaveText('Not saved');
		await expect(saveState(page)).toBeVisible();
		const warning = saveState(page).locator('.i-ri-error-warning-line');
		await expect(warning).toBeVisible();
		await expect(warning).toHaveAttribute('aria-hidden', 'true');
		expect(await hasNoHorizontalScroll(page)).toBe(true);
	});
});
