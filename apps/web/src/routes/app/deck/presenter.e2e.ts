import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type { DeckSettings } from '#lib/deck-settings.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

const slides = ['# One', '# Two', '# Three', '# Four', '# Five', '# Six'];

/** Creates a deck in the page's database and returns its id. */
async function createDeck(page: Page, settings?: DeckSettings): Promise<string> {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	return page.evaluate(
		async ({ urls, slides, settings }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Field notes', slides, settings });
			return deck.id;
		},
		{ urls: modules, slides, settings }
	);
}

const slideHeading = (page: Page) => page.locator('article.slide h1');
const progress = (page: Page) => page.getByRole('progressbar');
const controls = (page: Page) => page.getByRole('toolbar', { name: 'Presenter controls' });

async function present(page: Page, id: string, hash = '') {
	await page.goto(`/app/deck/${id}/present${hash}`);
	await expect(slideHeading(page)).toBeVisible({ timeout: 30_000 });
}

async function expectSlide(page: Page, number: number) {
	await expect(slideHeading(page)).toHaveText(slides[number - 1]!.slice(2));
	await expect(page).toHaveURL(new RegExp(`/present#${number}$`));
	await expect(progress(page)).toHaveAttribute('aria-label', `Slide ${number} of ${slides.length}`);
}

test('a clicker moves through the deck with PageDown and PageUp', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id);
	await expectSlide(page, 1);
	await page.keyboard.press('PageDown');
	await expectSlide(page, 2);
	await page.keyboard.press('PageDown');
	await expectSlide(page, 3);
	await page.keyboard.press('PageUp');
	await expectSlide(page, 2);
});

test('every Next and Previous key moves one slide, and Home and End jump to the ends', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#3');
	for (const key of ['ArrowRight', 'ArrowDown', 'Space', 'PageDown', 'Enter', 'l', 'j']) {
		await page.keyboard.press(key);
		await expectSlide(page, 4);
		await page.keyboard.press('ArrowLeft');
		await expectSlide(page, 3);
	}
	for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'h', 'k']) {
		await page.keyboard.press(key);
		await expectSlide(page, 2);
		await page.keyboard.press('ArrowRight');
		await expectSlide(page, 3);
	}
	await page.keyboard.press('End');
	await expectSlide(page, 6);
	await page.keyboard.press('Home');
	await expectSlide(page, 1);
});

test('Next on the last slide and Previous on the first do nothing', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#6');
	await page.keyboard.press('PageDown');
	await page.keyboard.press('ArrowRight');
	await expectSlide(page, 6);
	await page.keyboard.press('Home');
	await page.keyboard.press('PageUp');
	await page.keyboard.press('ArrowLeft');
	await expectSlide(page, 1);
});

test('keys held with Ctrl, Alt or Meta are left to the browser', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#2');
	for (const key of ['Control+ArrowRight', 'Alt+ArrowLeft', 'Meta+ArrowRight', 'Control+l']) {
		await page.keyboard.press(key);
	}
	await expectSlide(page, 2);
});

test('a reload on slide 4 stays on slide 4', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id);
	for (let count = 0; count < 3; count++) await page.keyboard.press('ArrowRight');
	await expectSlide(page, 4);
	await page.reload();
	await expect(slideHeading(page)).toHaveText('Four', { timeout: 30_000 });
	await expectSlide(page, 4);
});

test('a hash the person changes moves to that slide, and a junk or out-of-range one is clamped', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#99');
	await expectSlide(page, 6);
	await page.evaluate(() => (location.hash = '#3'));
	await expectSlide(page, 3);
	await page.goBack();
	await expectSlide(page, 6);
	await present(page, id, '#junk');
	await expectSlide(page, 1);
});

test('a tap on the right third moves forward and one on the left third moves back', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#3');
	const { width, height } = page.viewportSize()!;
	await page.mouse.click(width * 0.9, height / 2);
	await expectSlide(page, 4);
	await page.mouse.click(width * 0.1, height / 2);
	await page.mouse.click(width * 0.1, height / 2);
	await expectSlide(page, 2);
	await page.mouse.click(width / 2, height / 3);
	await expectSlide(page, 2);
});

test('a click that closes the shortcuts moves no slide', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#2');
	const help = page.getByRole('dialog', { name: 'Shortcuts' });
	const { width, height } = page.viewportSize()!;
	await page.keyboard.press('?');
	await expect(help).toBeVisible();
	await page.mouse.click(width - 8, height / 2);
	await expect(help).toBeHidden();
	await expectSlide(page, 2);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.keyboard.press('?');
	const card = await help.locator('section').boundingBox();
	await page.mouse.click(card!.x + card!.width - 8, card!.y + 8);
	await expect(help).toBeVisible();
	await expectSlide(page, 2);
});

test('moving fast lands on the last slide asked for, without leaving the stage empty', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#1');
	await page.evaluate(() => {
		const state = globalThis as unknown as { stageEmptied: boolean };
		state.stageEmptied = false;
		new MutationObserver(() => {
			if (!document.querySelector('article.slide')) state.stageEmptied = true;
		}).observe(document.body, { subtree: true, childList: true });
	});
	for (let index = 0; index < 4; index++) await page.keyboard.press('PageDown');
	await page.keyboard.press('PageUp');
	await expectSlide(page, 4);
	expect(await page.evaluate(() => (globalThis as unknown as { stageEmptied: boolean }).stageEmptied)).toBe(false);
});

test('the controls and the cursor show on pointer movement and hide after two seconds', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#2');
	const presenter = page.locator('.presenter');
	await expect(controls(page)).toHaveCSS('opacity', '0');
	await expect(presenter).toHaveCSS('cursor', 'none');
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	await expect(presenter).not.toHaveCSS('cursor', 'none');
	await expect(controls(page)).toContainText('2 / 6');
	const shown = Date.now();
	await expect(controls(page)).toHaveCSS('opacity', '0', { timeout: 5000 });
	expect(Date.now() - shown).toBeGreaterThan(1500);
	await expect(presenter).toHaveCSS('cursor', 'none');
});

test('the controls move through the deck and open the shortcuts', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#2');
	await page.mouse.move(300, 300);
	await controls(page).getByRole('button', { name: 'Next slide' }).click();
	await expectSlide(page, 3);
	await controls(page).getByRole('button', { name: 'Previous slide' }).click();
	await expectSlide(page, 2);
	await expect(controls(page).getByRole('button', { name: 'Overview' })).toBeDisabled();
	await controls(page).getByRole('button', { name: 'Shortcuts' }).click();
	await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toBeVisible();
});

test('? shows every key the presenter handles, and ? or Esc hides it', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#2');
	await page.keyboard.press('?');
	const help = page.getByRole('dialog', { name: 'Shortcuts' });
	await expect(help).toBeVisible();
	await expect(help).toContainText('Press ? or Esc to close.');
	await expect(help.locator('kbd')).toHaveText([
		// Next slide, Previous slide, then the rest.
		'→',
		'↓',
		'Space',
		'PageDown',
		'Enter',
		'L',
		'J',
		'←',
		'↑',
		'PageUp',
		'Backspace',
		'H',
		'K',
		'Home',
		'End',
		'F',
		'Esc',
		'?'
	]);
	await expect(help.locator('dd')).toHaveText([
		'Next slide',
		'Previous slide',
		'First or last slide',
		'Next or previous slide',
		'Full screen on or off',
		'Leave full screen, then stop presenting',
		'Show or hide shortcuts'
	]);
	await expect(help).toContainText('Tap the right or left third');
	await page.keyboard.press('ArrowRight');
	await expectSlide(page, 2);
	await page.keyboard.press('Escape');
	await expect(help).toBeHidden();
	await expect(page).toHaveURL(/\/present#2$/);
	await page.keyboard.press('?');
	await expect(help).toBeVisible();
	await page.keyboard.press('?');
	await expect(help).toBeHidden();
});

test('f toggles full screen, Esc leaves it, and a second Esc returns to the editor', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#3');
	const isFullscreen = () => page.evaluate(() => document.fullscreenElement !== null);
	await page.keyboard.press('f');
	await expect.poll(isFullscreen).toBe(true);
	await page.keyboard.press('f');
	await expect.poll(isFullscreen).toBe(false);
	await page.keyboard.press('f');
	await expect.poll(isFullscreen).toBe(true);
	await page.keyboard.press('Escape');
	await expect.poll(isFullscreen).toBe(false);
	await expect(page).toHaveURL(/\/present#3$/);
	// Past the guard that ignores an Escape arriving right after the browser left full screen.
	await page.waitForTimeout(600);
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(new RegExp(String.raw`/app/deck/${id}\?slide=3$`));
});

test('Stop presenting returns to the editor on the current slide', async ({ page }) => {
	const id = await createDeck(page);
	await present(page, id, '#5');
	await page.mouse.move(300, 300);
	await controls(page).getByRole('button', { name: 'Stop presenting' }).click();
	await expect(page).toHaveURL(new RegExp(String.raw`/app/deck/${id}\?slide=5$`));
});

test('the slide number shows only when the deck turns it on', async ({ page }) => {
	const plain = await createDeck(page);
	await present(page, plain, '#2');
	await expect(page.locator('.number')).toHaveCount(0);
	const numbered = await createDeck(page, { slideNumber: true });
	await present(page, numbered, '#2');
	await expect(page.locator('.stage .number')).toHaveText('2 / 6');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('.stage .number')).toHaveText('3 / 6');
});

test('a browser without the Screen Wake Lock API presents without an error', async ({ page }) => {
	const errors: Error[] = [];
	page.on('pageerror', (error) => void errors.push(error));
	await page.addInitScript(() => {
		delete (Navigator.prototype as { wakeLock?: unknown }).wakeLock;
	});
	const id = await createDeck(page);
	await present(page, id);
	expect(await page.evaluate(() => 'wakeLock' in navigator)).toBe(false);
	await page.keyboard.press('ArrowRight');
	await expectSlide(page, 2);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.keyboard.press('ArrowRight');
	await expectSlide(page, 3);
	expect(errors).toEqual([]);
});

test('the presenter keeps the screen on, and asks again when the tab becomes visible', async ({ page }) => {
	await page.addInitScript(() => {
		const requests: string[] = [];
		Object.assign(globalThis, { wakeLockRequests: requests });
		Object.defineProperty(Navigator.prototype, 'wakeLock', {
			configurable: true,
			get: () => ({
				request: async (type: string) => {
					requests.push(type);
					return { release: async () => {} };
				}
			})
		});
	});
	const id = await createDeck(page);
	await present(page, id);
	const requests = () =>
		page.evaluate(() => (globalThis as unknown as { wakeLockRequests: string[] }).wakeLockRequests);
	await expect.poll(requests).toEqual(['screen']);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(requests).toEqual(['screen', 'screen']);
});

test('a deck that does not exist shows Deck not found', async ({ page }) => {
	await page.goto('/app/deck/00000000-0000-4000-8000-000000000000/present');
	await expect(page.getByRole('heading', { name: 'Deck not found' })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('link', { name: 'Back to decks' })).toHaveAttribute('href', '/app');
});
