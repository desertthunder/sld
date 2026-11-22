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
	await expect(editor(page)).toHaveValue('# Three');
	await page.reload();
	await expect(selectedItem(page)).toHaveText('Slide 3 Three', { timeout: 30_000 });
	await expect(editor(page)).toHaveValue('# Three');
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
	await expect(editor(page)).toHaveValue('# Two, edited', { timeout: 30_000 });
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
	expect(await storedSlides(page, id)).toEqual(['# One', '# Two', '# Three', '# Three', '# Three']);
});

test('keys typed in the editor and the title do not reach the slide list', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One', '# Two']);
	await openDeck(page, id);
	await editor(page).fill('');
	await editor(page).pressSequentially('nd');
	await expect(editor(page)).toHaveValue('nd');
	await expect(slideItems(page)).toHaveCount(2);
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
	expect(await storedSlides(page, id)).toEqual(['# One']);
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

test('Present shows disabled until the presenter exists', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await expect(page.getByRole('button', { name: /Present/ })).toBeDisabled();
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
		await expect(page.getByRole('heading', { level: 1, name: "This deck isn't here" })).toBeVisible({
			timeout: 30_000
		});
		await expect(page.getByRole('link', { name: 'Back to decks' })).toHaveAttribute('href', '/app');
	}
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

		await tabs.getByRole('tab', { name: 'Slides' }).click();
		await expect(slideList(page)).toBeVisible();
		await expect(editor(page)).toBeHidden();
		expect(await hasNoHorizontalScroll(page)).toBe(true);

		await page.reload();
		await expect(slideList(page)).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('tab', { name: 'Slides' })).toHaveAttribute('aria-selected', 'true');

		await slideItems(page).nth(1).click();
		await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
		await expect(editor(page)).toHaveValue(/^# Very long heading/);
		expect(await hasNoHorizontalScroll(page)).toBe(true);

		await page.getByRole('tab', { name: 'Preview' }).click();
		await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();
		await page.setViewportSize({ width: 844, height: 390 });
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
		expect(await hasNoHorizontalScroll(page)).toBe(true);
	});
});
