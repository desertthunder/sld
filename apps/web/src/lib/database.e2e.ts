import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type { MigrationProgress } from '#lib/migrate.ts';

declare global {
	function recordMigration(progress: MigrationProgress): void;
}

const note = 'first slide';

// The dev server serves the app's modules at their source paths.
const databaseModule = '/src/lib/database.ts';

/**
 * Collects the migration progress the elected worker posts while `page` loads, on every load. `applied` resolves as
 * soon as the first load reports every migration applied.
 */
async function recordMigrations(page: Page) {
	const progress: MigrationProgress[] = [];
	const { promise: applied, resolve } = Promise.withResolvers<void>();
	await page.exposeFunction('recordMigration', (update: MigrationProgress) => {
		progress.push(update);
		if (update.applied === update.total) resolve();
	});
	await page.addInitScript(() => {
		new BroadcastChannel('sld-migrations').addEventListener('message', (event) => recordMigration(event.data));
	});
	return { progress, applied };
}

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

/**
 * Opens the database the way the app does, and writes the note to a table of its own through `writeDurably`, while
 * other syncs are in flight, as when another tab writes or this one is hidden.
 */
async function saveNote(page: Page) {
	await page.evaluate(
		async ({ url, body }) => {
			const { openDatabase, writeDurably } = (await import(url)) as typeof DatabaseModule;
			const database = await openDatabase();
			const others = Array.from({ length: 4 }, () => database.$client.syncToFs());
			await writeDurably(database, async ({ $client }) => {
				await $client.exec('create table if not exists notes (body text not null)');
				await $client.query('insert into notes (body) values ($1)', [body]);
			});
			void Promise.allSettled(others);
		},
		{ url: databaseModule, body: note }
	);
}

async function readNotes(page: Page): Promise<string[]> {
	return page.evaluate(async (url) => {
		const { openDatabase } = (await import(url)) as typeof DatabaseModule;
		const { $client } = await openDatabase();
		const result = await $client.query<{ body: string }>('select body from notes');
		return result.rows.map(({ body }) => body);
	}, databaseModule);
}

test('a reload right after the first open finds every migration applied', async ({ page }) => {
	const { progress, applied } = await recordMigrations(page);
	await page.goto('/app');
	await applied;
	progress.length = 0;
	await page.reload();
	await waitForApp(page);
	expect(progress).toEqual([]);
});

test('a saved row survives an immediate reload', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	await saveNote(page);
	await page.reload();
	await waitForApp(page);
	expect(await readNotes(page)).toEqual([note]);
});

test('a saved row survives closing the tab', async ({ context }) => {
	const first = await context.newPage();
	await first.goto('/app');
	await waitForApp(first);
	await saveNote(first);
	await first.close();
	const second = await context.newPage();
	await second.goto('/app');
	await waitForApp(second);
	expect(await readNotes(second)).toEqual([note]);
});

test("a row saved in a tab that another tab's worker serves survives that tab reloading", async ({ context }) => {
	const leader = await context.newPage();
	await leader.goto('/app');
	await waitForApp(leader);
	const follower = await context.newPage();
	await follower.goto('/app');
	await waitForApp(follower);
	await saveNote(follower);
	await follower.close();
	await leader.reload();
	await waitForApp(leader);
	expect(await readNotes(leader)).toEqual([note]);
});

test("a write in a tab that another tab's worker serves fails or is saved when the other tab closes during it", async ({
	context
}) => {
	const leader = await context.newPage();
	await leader.goto('/app');
	await waitForApp(leader);
	const follower = await context.newPage();
	await follower.goto('/app');
	await waitForApp(follower);
	await follower.evaluate(
		async ({ url, body }) => {
			const { openDatabase, writeDurably } = (await import(url)) as typeof DatabaseModule;
			const database = await openDatabase();
			await database.$client.exec('create table if not exists notes (body text not null)');
			const outcome = { state: 'saving' };
			Object.assign(globalThis, { outcome });
			for (let index = 0; index < 4; index++) void database.$client.syncToFs().catch(() => {});
			void (async () => {
				try {
					await writeDurably(database, ({ $client }) =>
						$client.query('insert into notes (body) values ($1)', [body])
					);
					outcome.state = 'saved';
				} catch (error) {
					outcome.state = error instanceof Error ? error.message : String(error);
				}
			})();
		},
		{ url: databaseModule, body: note }
	);
	await leader.close();
	const outcome = () =>
		follower.evaluate(() => (globalThis as unknown as { outcome: { state: string } }).outcome.state);
	await expect.poll(outcome, { timeout: 20_000 }).not.toBe('saving');
	const notes = await readNotes(follower);
	if ((await outcome()) === 'saved') expect(notes).toEqual([note]);
	else expect(await outcome()).toMatch(/leader changed/i);
});
