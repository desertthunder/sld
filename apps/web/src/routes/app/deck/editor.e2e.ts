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

test('keys typed in the editor do not reach the slide list', async ({ page }) => {
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
	await expect(editor(page)).toHaveValue('# One');
});

test('saving the title by clicking away leaves focus where it went', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	await page.getByRole('button', { name: 'Rename deck: Talk' }).click();
	await page.getByRole('textbox', { name: 'Deck title' }).fill('Field notes');
	await editor(page).click();
	await page.keyboard.type(' and more');
	await expect(editor(page)).toHaveValue('# One and more');
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

test('P typed in the markdown stays text', async ({ page }) => {
	const id = await createDeck(page, 'Talk', ['# One']);
	await openDeck(page, id);
	const markdown = page.getByRole('textbox', { name: /Markdown for slide/ });
	await markdown.fill('# One');
	await markdown.press('End');
	await markdown.press('p');
	await expect(markdown).toHaveValue('# Onep');
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

/** Makes every later slide write fail, by moving the slides table out of the way. */
async function breakSlideWrites(page: Page) {
	await page.evaluate(
		async ({ urls }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const database = await openDatabase();
			await database.$client.exec('ALTER TABLE slides RENAME TO slides_away');
		},
		{ urls: modules }
	);
}

const saveState = (page: Page) => page.getByRole('banner').locator('.saved');

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
		await expect(editor(page)).toHaveValue(/^# Very long heading/);
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
