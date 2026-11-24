import { expect, test, type Locator, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';

declare global {
	// Set only by a script URL in a slide, which must never run.
	var sldRan: string[] | undefined;
}

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

const lines = (...rows: string[]) => rows.join('\n');
const mark = (name: string) => `(globalThis.sldRan??=[]).push('${name}')`;
const png =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const hostile = lines(
	'# Addresses',
	'',
	`[Script link](javascript:${mark('link')}) and [Shouting link](JaVaScRiPt:${mark('upper')})`,
	'',
	`![Script image](javascript:${mark('image')})`,
	'',
	`[Page link](data:text/html,%3Cscript%3E${mark('data')}%3C/script%3E)`,
	'',
	`![Vector image](data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20onload=%22${mark('svg')}%22/%3E)`,
	'',
	`![Dot](${png})`,
	'',
	'[Site](https://example.com) [Mail](mailto:someone@example.com) [Notes](notes.md)'
);

async function createDeck(page: Page, slides: string[]): Promise<string> {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	return page.evaluate(
		async ({ urls, slides }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Addresses', slides });
			return deck.id;
		},
		{ urls: modules, slides }
	);
}

const previewSlide = (page: Page) => page.getByRole('region', { name: 'Preview' }).locator('article.slide');
const thumbnail = (page: Page) => page.getByRole('navigation', { name: 'Slides' }).locator('.thumb').first();
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const ran = (page: Page) => page.evaluate(() => globalThis.sldRan ?? []);

/** Every link and image address in a drawn slide. */
function addresses(slide: Locator) {
	return slide.evaluate((element) => ({
		links: [...element.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]),
		images: [...element.querySelectorAll('img')].map((image) => [image.alt, image.getAttribute('src')])
	}));
}

/** Checks a drawn slide keeps only the safe addresses, clicks what the script links were, and loads the dot. */
async function expectInert(page: Page, slide: Locator, { canClick = true } = {}) {
	await expect(slide.locator('img[alt="Dot"]')).toBeAttached({ timeout: 30_000 });
	expect(await addresses(slide)).toEqual({
		links: [
			['Site', 'https://example.com'],
			['Mail', 'mailto:someone@example.com'],
			['Notes', 'notes.md']
		],
		images: [['Dot', png]]
	});
	await expect(slide).toContainText('Script link and Shouting link');
	await expect(slide).toContainText('Script image');
	await expect(slide).toContainText('Page link');
	await expect(slide).toContainText('Vector image');
	expect(await slide.locator('img[alt="Dot"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
	if (canClick) {
		for (const text of ['Script link', 'Shouting link', 'Script image', 'Page link', 'Vector image']) {
			await slide.getByText(text).first().click();
		}
	}
	expect(await ran(page)).toEqual([]);
}

test('a typed slide shows script and data links as text in the preview, thumbnail and presenter', async ({ page }) => {
	const id = await createDeck(page, ['# Start']);
	await page.goto(`/app/deck/${id}`);
	await editor(page).fill(hostile);
	await expect(previewSlide(page).locator('h1')).toHaveText('Addresses', { timeout: 30_000 });
	await expectInert(page, previewSlide(page));
	await expectInert(page, thumbnail(page).locator('article.slide'), { canClick: false });
	await expect(page.getByRole('banner').locator('.saved')).toHaveText('Saved');

	await page.goto(`/app/deck/${id}/present`);
	await expectInert(page, page.locator('article.slide'));
	await expect(page).toHaveURL(new RegExp(`/app/deck/${id}/present`));
});

test('an imported deck shows script and data links as text in the preview and presenter', async ({ page }) => {
	await page.goto('/app');
	const importButton = page.getByRole('button', { name: 'Import', exact: true });
	await expect(importButton).toBeEnabled({ timeout: 30_000 });
	const chooser = page.waitForEvent('filechooser');
	await importButton.click();
	const fileChooser = await chooser;
	await fileChooser.setFiles([{ name: 'Addresses.md', mimeType: 'text/markdown', buffer: Buffer.from(hostile) }]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}(\?|$)/, { timeout: 30_000 });
	await expectInert(page, previewSlide(page));
	await expectInert(page, thumbnail(page).locator('article.slide'), { canClick: false });

	await page.goto(page.url().replace(/(\?.*)?$/, '/present'));
	await expectInert(page, page.locator('article.slide'));
});

test('raw HTML a person types keeps its address', async ({ page }) => {
	const id = await createDeck(page, [lines('# Raw', '', `<a href="javascript:${mark('raw')}">Raw link</a>`)]);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).getByText('Raw link')).toHaveAttribute('href', `javascript:${mark('raw')}`, {
		timeout: 30_000
	});
});

test('the shortcuts help links to the rules for links and images', async ({ page }) => {
	const id = await createDeck(page, ['# One']);
	await page.goto(`/app/deck/${id}/present`);
	await expect(page.locator('article.slide h1')).toBeVisible({ timeout: 30_000 });
	await page.keyboard.press('?');
	await expect(
		page.getByRole('dialog', { name: 'Shortcuts' }).getByRole('link', { name: 'Links and images a slide keeps' })
	).toHaveAttribute('href', /\/docs\/design\.md#links-and-images$/);
});
