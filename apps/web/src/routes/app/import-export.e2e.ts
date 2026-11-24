import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type * as ImportedHtmlModule from '#lib/imported-html.ts';

declare global {
	// Set only by script in an imported deck, which must never run.
	var sldRan: string[] | undefined;
}

// The dev server serves the app's modules at their source paths.
const modules = {
	database: '/src/lib/database.ts',
	decks: '/src/lib/decks.ts',
	importedHtml: '/src/lib/imported-html.ts'
};

const lines = (...rows: string[]) => rows.join('\n');

const hostile = lines(
	'# Hostile',
	'',
	'<script>(globalThis.sldRan ??= []).push("script")</script>',
	'',
	'Look <img src="missing.png" alt="broken" onerror="(globalThis.sldRan ??= []).push(\'onerror\')"> here.',
	'',
	'<div class="note" onmouseover="(globalThis.sldRan ??= []).push(\'hover\')">',
	'',
	'Hover me',
	'',
	'</div>',
	'',
	'---',
	'',
	'## Code',
	'',
	'Write `<script>` like this:',
	'',
	'```html',
	'<script>alert(1)</script>',
	'```'
);

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openLibrary(page: Page) {
	await page.goto('/app');
	await waitForApp(page);
	await expect(importButton(page)).toBeEnabled();
}

/** Every stored deck, the most recently changed first, with its slides. */
async function storedDecks(page: Page) {
	return page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { listDecksWithSlides } = (await import(urls.decks)) as typeof DecksModule;
		return listDecksWithSlides(await openDatabase());
	}, modules);
}

async function chooseFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
	const chooser = page.waitForEvent('filechooser');
	await importButton(page).click();
	const fileChooser = await chooser;
	await fileChooser.setFiles(files);
}

const markdownFile = (name: string, text: string) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });
const importButton = (page: Page) => page.getByRole('button', { name: 'Import', exact: true });
const rows = (page: Page) => page.getByRole('region', { name: 'Library' }).getByRole('listitem');
const titles = (page: Page) => rows(page).locator('a.title');
const previewSlide = (page: Page) => page.getByRole('region', { name: 'Preview' }).locator('article.slide');
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const ran = (page: Page) => page.evaluate(() => globalThis.sldRan ?? []);

test('DOMPurify keeps safe HTML byte for byte and takes scripts and handlers out of the rest', async ({ page }) => {
	await openLibrary(page);
	const cleaned = await page.evaluate(
		async ({ url, slides }) => {
			const { cleanImportedSlide } = (await import(url)) as typeof ImportedHtmlModule;
			return slides.map((slide) => cleanImportedSlide(slide));
		},
		{
			url: modules.importedHtml,
			slides: [
				lines('<div class=cols>', '', '**Left**', '', '</div>', '', 'A <br/> and <kbd>Ctrl</kbd>'),
				'<iframe src="https://example.com/embed" width="560" height="315" allowfullscreen></iframe>',
				lines('<script>steal()</script>', '', 'Text'),
				'An <img src="a.png" onerror="steal()"> image',
				lines('<div class="cols" onclick="steal()">', '', '**Left**', '', '</div>'),
				'<a href="javascript:steal()">link</a> and <svg><circle onload="steal()" r="4"></circle></svg>',
				'<iframe srcdoc="<script>steal()</script>"></iframe>',
				lines('<svg>', '', '<style><img src=x onerror="steal()"></style>'),
				lines('> <p', '> onclick="steal()">quoted</p>'),
				lines('Write `<script>` like this:', '', '```html', '<img src=x onerror="steal()">', '```')
			]
		}
	);
	expect(cleaned.slice(0, 2)).toEqual([
		lines('<div class=cols>', '', '**Left**', '', '</div>', '', 'A <br/> and <kbd>Ctrl</kbd>'),
		'<iframe src="https://example.com/embed" width="560" height="315" allowfullscreen></iframe>'
	]);
	expect(cleaned[2]).toBe(lines('', '', 'Text'));
	expect(cleaned[3]).toBe('An <img src="a.png"> image');
	expect(cleaned[4]).toBe(lines('<div class="cols">', '', '**Left**', '', '</div>'));
	expect(cleaned[9]).toBe(
		lines('Write `<script>` like this:', '', '```html', '<img src=x onerror="steal()">', '```')
	);
	for (const slide of cleaned.slice(2, 9)) {
		expect(slide).not.toMatch(/steal|<script/);
	}
});

test('an imported file with a script and handlers makes a deck where neither runs, and code still shows them', async ({
	page
}) => {
	await openLibrary(page);
	await chooseFiles(page, [markdownFile('Hostile.md', hostile)]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}$/, { timeout: 30_000 });

	const [deck] = await storedDecks(page);
	expect(deck!.title).toBe('Hostile');
	const stored = deck!.slides.map(({ markdown }) => markdown);
	expect(stored).toHaveLength(2);
	expect(stored[0]).not.toMatch(/<script|onerror|onmouseover/);
	expect(stored[0]).toContain('<img src="missing.png" alt="broken">');
	expect(stored[1]).toBe(
		lines('## Code', '', 'Write `<script>` like this:', '', '```html', '<script>alert(1)</script>', '```')
	);

	// The editor's preview draws the slide, the broken image included.
	await expect(previewSlide(page).locator('img[alt="broken"]')).toBeAttached({ timeout: 30_000 });
	await previewSlide(page).getByText('Hover me').hover();
	await editor(page).fill(`${stored[0]}\n\nEdited`);
	await expect(previewSlide(page).getByText('Edited')).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Slides' })
		.getByRole('button', { name: 'Slide 2 Code', exact: true })
		.click();
	await expect(previewSlide(page).locator('code').filter({ hasText: '<script>alert(1)</script>' })).toBeVisible();
	await expect(previewSlide(page).getByText('<script>', { exact: true })).toBeVisible();
	expect(await ran(page)).toEqual([]);

	await page.goto(`/app/deck/${deck!.id}/present`);
	await expect(page.locator('article.slide img[alt="broken"]')).toBeAttached({ timeout: 30_000 });
	await page.locator('article.slide').getByText('Hover me').hover();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('article.slide code').filter({ hasText: '<script>alert(1)</script>' })).toBeVisible();
	expect(await ran(page)).toEqual([]);
	expect(await page.locator('[onerror], [onmouseover], article script').count()).toBe(0);
});

test('exporting a deck and importing the file gives the same deck', async ({ page }) => {
	await openLibrary(page);
	const slides = [
		lines('---', 'layout: center', 'class: big', '---', '', '# Talk'),
		lines('```md', '', '---', '', '```'),
		'<div class="cols">'
	];
	await page.evaluate(
		async ({ urls, slides }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			await createDeck(await openDatabase(), {
				title: 'Q3: plans',
				scheme: 'gruvbox-dark',
				aspect: '4:3',
				settings: { slideNumber: true },
				slides
			});
		},
		{ urls: modules, slides }
	);
	await page.reload();
	await waitForApp(page);

	await page.getByRole('button', { name: 'More actions for Q3: plans' }).click();
	const downloading = page.waitForEvent('download');
	await page.getByRole('menuitem', { name: 'Export' }).click();
	const file = await downloading;
	expect(file.suggestedFilename()).toBe('Q3 plans.md');
	const markdown = await readFile((await file.path())!, 'utf8');

	await chooseFiles(page, [markdownFile(file.suggestedFilename(), markdown)]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}$/, { timeout: 30_000 });
	const [imported, original] = await storedDecks(page);
	expect(imported!.id).not.toBe(original!.id);
	for (const deck of [imported!, original!]) {
		expect({
			title: deck.title,
			scheme: deck.scheme,
			aspect: deck.aspect,
			settings: deck.settings,
			slides: deck.slides.map(({ markdown }) => markdown)
		}).toEqual({
			title: 'Q3: plans',
			scheme: 'gruvbox-dark',
			aspect: '4:3',
			settings: { slideNumber: true },
			slides
		});
	}
});

test('Export all decks downloads one zip with a markdown file per deck', async ({ page }) => {
	await openLibrary(page);
	await page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
		const database = await openDatabase();
		await createDeck(database, { title: 'Talk', slides: ['# One'] });
		await createDeck(database, { title: 'Talk', slides: ['# Two'] });
	}, modules);
	await page.reload();
	await waitForApp(page);

	const downloading = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export all decks' }).click();
	const archive = await downloading;
	expect(archive.suggestedFilename()).toMatch(/^sld decks \d{4}-\d{2}-\d{2}\.zip$/);
	const files = unzipSync(await readFile((await archive.path())!));
	expect(Object.keys(files).toSorted((a, b) => a.localeCompare(b))).toEqual(['Talk (2).md', 'Talk.md']);
	expect(
		Object.values(files)
			.map((bytes) => strFromU8(bytes).split('\n').at(-2))
			.toSorted((a, b) => a!.localeCompare(b!))
	).toEqual(['# One', '# Two']);
});

test('several files dropped on the library import together, and the ones that are not markdown say so', async ({
	page
}) => {
	await openLibrary(page);
	const transfer = await page.evaluateHandle(() => {
		const transfer = new DataTransfer();
		transfer.items.add(new File(['# Heading\n\nText'], 'Field notes.md', { type: '' }));
		transfer.items.add(new File(['+++\ntitle = "Reading group"\n+++\n\n# One'], 'week-3.markdown'));
		transfer.items.add(new File(['png'], 'photo.png', { type: 'image/png' }));
		return transfer;
	});
	// Each event reports whether the page took it, as a drop the page leaves alone opens the file in the browser.
	const dispatch = (type: string) =>
		page.evaluate(
			({ type, transfer }) =>
				!document.body.dispatchEvent(
					new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true })
				),
			{ type, transfer }
		);
	await dispatch('dragenter');
	expect(await dispatch('dragover')).toBe(true);
	await expect(page.getByText('Drop markdown files to import them as decks')).toBeVisible();
	expect(await dispatch('drop')).toBe(true);
	await expect(page.getByText('Drop markdown files to import them as decks')).toBeHidden();
	await expect(page.getByRole('alert')).toHaveText("“photo.png” wasn't imported: not a markdown file");
	await expect(titles(page)).toHaveText(['Reading group', 'Field notes']);
	await expect(page).toHaveURL(/\/app$/);
});

test('a file over the size limit is refused before it is read', async ({ page }) => {
	await openLibrary(page);
	await chooseFiles(page, [markdownFile('Huge.md', `# Huge\n\n${'x'.repeat(5 * 1024 * 1024)}`)]);
	await expect(page.getByRole('alert')).toHaveText("“Huge.md” wasn't imported: over 5 MB");
	expect(await storedDecks(page)).toEqual([]);
});
