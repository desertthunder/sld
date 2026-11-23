import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type { MigrationProgress } from '#lib/migrate.ts';

declare global {
	function recordMigration(progress: MigrationProgress): void;
}

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts' };

const pasted = '# Talk\n\nIntro\n\n---\n\n## Middle\n\n- One point\n\n---\n\n## End\n';

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

function noteBox(page: Page) {
	return page.getByLabel('Your slides as markdown. A --- line starts a new slide.');
}

async function savedDecks(page: Page) {
	return page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { getDeck, listDecks } = (await import(urls.decks)) as typeof DecksModule;
		const database = await openDatabase();
		const decks = await listDecks(database);
		return Promise.all(
			decks.map(async ({ id }) => {
				const deck = await getDeck(database, id);
				return { title: deck?.title, slides: deck?.slides.map(({ markdown }) => markdown) };
			})
		);
	}, modules);
}

/** Collects the migration progress the elected worker posts, on every page load. */
async function recordMigrations(page: Page) {
	const progress: MigrationProgress[] = [];
	await page.exposeFunction('recordMigration', (update: MigrationProgress) => void progress.push(update));
	await page.addInitScript(() => {
		new BroadcastChannel('sld-migrations').addEventListener('message', (event) => recordMigration(event.data));
	});
	return progress;
}

test('a note pasted on the landing page opens in /app as one new deck with the same slides', async ({ page }) => {
	await page.goto('/');
	await noteBox(page).fill(pasted);
	await expect(page.getByText('3 slides', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open as a deck' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await waitForApp(page);
	const expected = [{ title: 'Talk', slides: ['# Talk\n\nIntro', '## Middle\n\n- One point', '## End'] }];
	await expect.poll(() => savedDecks(page), { timeout: 20_000 }).toEqual(expected);
	expect(await page.evaluate(() => sessionStorage.getItem('sld:handoff'))).toBeNull();
	await page.reload();
	await waitForApp(page);
	expect(await savedDecks(page)).toEqual(expected);
});

test('the landing page draws and responds before PGlite has downloaded', async ({ page }) => {
	const { promise: released, resolve: release } = Promise.withResolvers<void>();
	const { promise: held, resolve: hold } = Promise.withResolvers<void>();
	await page.route('**/@electric-sql/pglite/**', async (route) => {
		hold();
		await released;
		await route.continue();
	});
	await page.goto('/');
	await held;
	await expect(page.getByRole('heading', { level: 1, name: 'Easy slides from markdown' })).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Opening decks' })).toBeVisible();
	await noteBox(page).fill('# One\n\n---\n\n# Two');
	await expect(page.getByText('2 slides', { exact: true })).toBeVisible();
	await page.getByRole('textbox', { name: 'Live Preview' }).fill('## Edited');
	await expect(page.getByRole('textbox', { name: 'Live Preview' })).toHaveValue('## Edited');
	release();
	await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({ timeout: 30_000 });
});

test('a warming failure leaves the landing page usable and /app reports it', async ({ page }) => {
	await page.route('**/database-worker.ts*', (route) => route.abort());
	const blocked = page.waitForEvent('requestfailed', (request) => request.url().includes('database-worker'));
	await page.goto('/');
	await blocked;
	await expect(page.getByText('Opening decks')).toBeHidden({ timeout: 20_000 });
	await expect(page.getByText('Decks ready')).toBeHidden();
	await noteBox(page).fill('# One\n\n---\n\n# Two\n\n---\n\n# Three');
	await expect(page.getByText('3 slides', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Open App' }).first().click();
	await expect(page.getByRole('alert')).toContainText("Your decks didn't open", { timeout: 30_000 });
});

test('a database one migration behind is migrated from the landing page, leaving /app nothing to run', async ({
	page
}) => {
	const progress = await recordMigrations(page);
	await page.goto('/app');
	await waitForApp(page);
	// Undo the newest migration, as if the build before it last opened this database.
	const undone = await page.evaluate(async (url) => {
		const { openDatabase, writeDurably } = (await import(url)) as typeof DatabaseModule;
		return writeDurably(await openDatabase(), async ({ $client }) => {
			const { rows } = await $client.query<{ tag: string }>(
				'select tag from migrations order by tag desc limit 1'
			);
			await $client.exec('alter table decks drop column settings;');
			await $client.query('delete from migrations where tag = $1', [rows[0]!.tag]);
			return rows[0]!.tag;
		});
	}, modules.database);
	// The SQL above undoes only this migration, so a newer one needs its own.
	expect(undone).toBe('0002_add_deck_settings');
	progress.length = 0;
	await page.goto('/');
	await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({ timeout: 30_000 });
	expect(progress).toEqual([
		{ applied: 0, total: 1 },
		{ applied: 1, total: 1 }
	]);
	progress.length = 0;
	await page.getByRole('link', { name: 'Open App' }).first().click();
	await waitForApp(page);
	await page.reload();
	await waitForApp(page);
	expect(progress).toEqual([]);
	expect(await savedDecks(page)).toEqual([]);
});

test('a slide takes the layout and classes its frontmatter names, and keeps its notes off the slide', async ({
	page
}) => {
	await page.goto('/');
	const preview = page.getByRole('textbox', { name: 'Live Preview' });
	const slide = page.locator('.preview-card article.slide');
	for (const layout of ['default', 'title', 'center', 'section']) {
		await preview.fill(`---\nlayout: ${layout}\nclass: wide\nnotes: Only for the speaker\n---\n# Hi`);
		await expect(slide).toHaveClass(new RegExp(String.raw`^slide layout-${layout} wide\b`), { timeout: 30_000 });
		await expect(slide.getByRole('heading', { level: 1, name: 'Hi' })).toBeVisible();
		await expect(slide).not.toContainText('Only for the speaker');
	}
	await preview.fill('---\nlayout: two-column\n---\n# Hi');
	await expect(slide).toHaveClass(/^slide layout-default\b/);
});
