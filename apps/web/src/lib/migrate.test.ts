import { PGlite } from '@electric-sql/pglite';
import { generateDrizzleJson, generateMigration, pushSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/pglite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrations } from 'virtual:migrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, missingMigrations, openMigrated, type Migration } from '#lib/migrate.ts';
import { openInWorker, type WorkerScope } from '#lib/open-in-worker.ts';
import * as schema from '#lib/schema.ts';

const folder = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function tableNames(client: PGlite): Promise<string[]> {
	const result = await client.query<{ name: string }>(
		`select table_name as name from information_schema.tables where table_schema = 'public' order by name`
	);
	return result.rows.map(({ name }) => name);
}

async function appliedTags(client: PGlite): Promise<string[]> {
	const result = await client.query<{ tag: string }>('select tag from migrations order by tag');
	return result.rows.map(({ tag }) => tag);
}

/**
 * Leaves out the statements that drop and re-add a unique constraint the database already has with the same columns
 * in the same order. drizzle-kit reads a constraint's columns without their order, so it sees `(deck_id, position)` as
 * `(position, deck_id)` and asks to rebuild it.
 */
async function withoutReorderedUniques(client: PGlite, statements: string[]): Promise<string[]> {
	const result = await client.query<{ name: string; columns: string[] }>(
		`select conname as name, array(
			select attname from unnest(conkey) with ordinality as key(attnum, ord)
			join pg_attribute on attrelid = conrelid and pg_attribute.attnum = key.attnum order by ord
		) as columns from pg_constraint where contype = 'u'`
	);
	const unchanged = new Set(
		result.rows.flatMap(({ name, columns }) =>
			statements.some((statement) =>
				statement.endsWith(`ADD CONSTRAINT "${name}" UNIQUE("${columns.join('","')}");`)
			)
				? [name]
				: []
		)
	);
	return statements.filter((statement) =>
		[...unchanged].every(
			(name) =>
				!statement.includes(`DROP CONSTRAINT "${name}";`) && !statement.includes(`ADD CONSTRAINT "${name}" `)
		)
	);
}

// Each case starts PGlite and introspects it, which takes a few seconds when every suite runs at once.
describe('the migrations drizzle-kit wrote', { timeout: 30_000 }, () => {
	it.for([...migrations.keys(), migrations.length])(
		'bring a database after %i of them to the schema',
		async (start) => {
			const client = new PGlite();
			await migrate(client, migrations.slice(0, start));
			await migrate(client, migrations);
			const { statementsToExecute } = await pushSchema(schema, drizzle({ client }));
			expect(await withoutReorderedUniques(client, statementsToExecute)).toEqual([]);
			expect(await appliedTags(client)).toEqual(migrations.map(({ tag }) => tag));
			await client.close();
		}
	);

	it('keep the rows of a database migrated before the decks tables existed', async () => {
		const client = new PGlite();
		await migrate(client, migrations.slice(0, 1));
		const before = await client.query('select tag, applied_at from migrations');
		await migrate(client, migrations);
		const after = await client.query('select tag, applied_at from migrations order by tag');
		expect(after.rows.slice(0, 1)).toEqual(before.rows);
		expect(await tableNames(client)).toEqual(['decks', 'migrations', 'slides']);
		await client.close();
	});

	it('keep the decks and slides of a database migrated before decks had settings', async () => {
		const client = new PGlite();
		const before = migrations.findIndex(({ tag }) => tag === '0002_add_deck_settings');
		await migrate(client, migrations.slice(0, before));
		const inserted = await client.query<{ id: string }>(
			`insert into decks (title, scheme, aspect) values ('Talk', 'oxocarbon-dark', '4:3') returning id`
		);
		await client.query(
			`insert into slides (deck_id, position, markdown) values ($1, 0, '# One'), ($1, 1, '# Two')`,
			[inserted.rows[0]!.id]
		);
		const decks = await client.query<Record<string, unknown>>('select * from decks');
		const slides = await client.query('select * from slides order by position');
		await migrate(client, migrations);
		const migratedDecks = await client.query<Record<string, unknown>>('select * from decks');
		const migratedSlides = await client.query('select * from slides order by position');
		const withoutSettings = await client.query('select id from decks where settings is null');
		expect(migratedDecks.rows).toEqual(decks.rows.map((row) => expect.objectContaining(row)));
		expect(withoutSettings.rows).toHaveLength(decks.rows.length);
		expect(migratedSlides.rows).toEqual(slides.rows);
		await client.close();
	});

	it('make the unique slide position per deck deferrable, so one statement can renumber slides', async () => {
		const client = new PGlite();
		await migrate(client, migrations);
		const result = await client.query<{ deferrable: boolean; deferred: boolean }>(
			`select condeferrable as deferrable, condeferred as deferred from pg_constraint
			where conname = 'slides_deck_id_position_unique'`
		);
		expect(result.rows).toEqual([{ deferrable: true, deferred: false }]);
		await client.close();
	});

	it('end with a snapshot that matches the schema, so the next generate writes only new changes', async () => {
		const last = migrations.at(-1)!.tag.split('_', 1)[0];
		const snapshot = JSON.parse(await readFile(`${folder}/meta/${last}_snapshot.json`, 'utf8'));
		expect(await generateMigration(snapshot, generateDrizzleJson(schema, snapshot.id))).toEqual([]);
	});
});

const create = migrations[0];
const notes: Migration = { tag: '0001_notes', sql: 'create table notes (id serial primary key, body text not null);' };
const titles: Migration = { tag: '0002_titles', sql: `alter table notes add column title text not null default '';` };

describe('migrate', () => {
	let client: PGlite;

	beforeEach(() => {
		client = new PGlite();
	});

	afterEach(async () => {
		if (!client.closed) await client.close();
	});

	it('applies every migration to a fresh database', async () => {
		await migrate(client, [create, notes, titles]);
		expect(await tableNames(client)).toEqual(['migrations', 'notes']);
		expect(await appliedTags(client)).toEqual([create.tag, notes.tag, titles.tag]);
	});

	it('applies only the missing migration to a database one behind, keeping its decks', async () => {
		await migrate(client, [create, notes]);
		await client.query(`insert into notes (body) values ('first slide'), ('second slide')`);
		await migrate(client, [create, notes, titles]);
		const result = await client.query('select body, title from notes order by id');
		expect(result.rows).toEqual([
			{ body: 'first slide', title: '' },
			{ body: 'second slide', title: '' }
		]);
		expect(await appliedTags(client)).toEqual([create.tag, notes.tag, titles.tag]);
	});

	it('does nothing when every migration is applied', async () => {
		await migrate(client, [create, notes]);
		const onProgress = vi.fn();
		await migrate(client, [create, notes], onProgress);
		expect(onProgress).not.toHaveBeenCalled();
		expect(await appliedTags(client)).toEqual([create.tag, notes.tag]);
	});

	it('reports progress through the migrations it applies', async () => {
		await migrate(client, [create]);
		const onProgress = vi.fn();
		await migrate(client, [create, notes, titles], onProgress);
		expect(onProgress.mock.calls).toEqual([
			[{ applied: 0, total: 2 }],
			[{ applied: 1, total: 2 }],
			[{ applied: 2, total: 2 }]
		]);
	});

	it('syncs each migration to storage after it commits and before reporting it applied', async () => {
		const events: string[] = [];
		const transaction = client.transaction.bind(client);
		vi.spyOn(client, 'transaction').mockImplementation(async (callback) => {
			const result = await transaction(callback);
			events.push('commit');
			return result;
		});
		vi.spyOn(client, 'syncToFs').mockImplementation(async () => {
			events.push('sync');
		});
		await migrate(client, [create, notes], ({ applied }) => {
			events.push(`applied ${applied}`);
		});
		const commits = events
			.entries()
			.filter(([, event]) => event === 'commit')
			.map(([index]) => index)
			.toArray();
		expect(commits.map((index) => events.slice(index, index + 3))).toEqual([
			['commit', 'sync', 'applied 1'],
			['commit', 'sync', 'applied 2']
		]);
	});

	it('rolls back a failing migration and stops before the next', async () => {
		await migrate(client, [create]);
		const broken: Migration = { tag: '0001_broken', sql: 'create table notes (id serial); select * from missing;' };
		await expect(migrate(client, [create, broken, titles])).rejects.toThrow(
			'Migration 0001_broken failed: relation "missing" does not exist'
		);
		expect(await tableNames(client)).toEqual(['migrations']);
		expect(await appliedTags(client)).toEqual([create.tag]);
	});

	it('rolls back a migration whose SQL ran when recording it fails', async () => {
		await migrate(client, [create]);
		const reused: Migration = { tag: notes.tag, sql: 'create table others (id serial primary key);' };
		await expect(migrate(client, [create, notes, reused])).rejects.toThrow(`Migration ${notes.tag} failed`);
		expect(await tableNames(client)).toEqual(['migrations', 'notes']);
		expect(await appliedTags(client)).toEqual([create.tag, notes.tag]);
	});
});

describe('missingMigrations', () => {
	let client: PGlite;

	beforeEach(() => {
		client = new PGlite();
	});

	afterEach(async () => {
		await client.close();
	});

	it('lists the migration a database one behind lacks, and changes nothing', async () => {
		await migrate(client, [create, notes]);
		await client.query(`insert into notes (body) values ('first slide')`);
		const exec = vi.spyOn(client, 'exec');
		const transaction = vi.spyOn(client, 'transaction');
		expect(await missingMigrations(client, [create, notes, titles])).toEqual([titles.tag]);
		expect(exec).not.toHaveBeenCalled();
		expect(transaction).not.toHaveBeenCalled();
		expect(await appliedTags(client)).toEqual([create.tag, notes.tag]);
		const decks = await client.query('select * from notes');
		expect(decks.rows).toEqual([{ id: 1, body: 'first slide' }]);
	});

	it('lists every migration for a database without the migrations table', async () => {
		expect(await missingMigrations(client, [create, notes])).toEqual([create.tag, notes.tag]);
		expect(await tableNames(client)).toEqual([]);
	});

	it('lists none for a database that has applied every migration, or more', async () => {
		await migrate(client, [create, notes, titles]);
		expect(await missingMigrations(client, [create, notes, titles])).toEqual([]);
		expect(await missingMigrations(client, [create, notes])).toEqual([]);
	});

	it('does not query when there are no migrations to look for', async () => {
		const query = vi.spyOn(client, 'query');
		expect(await missingMigrations(client, [])).toEqual([]);
		expect(query).not.toHaveBeenCalled();
	});
});

describe('openMigrated', () => {
	it('returns the migrated client', async () => {
		const client = await openMigrated(async () => new PGlite(), migrations);
		expect(await tableNames(client)).toEqual(['decks', 'migrations', 'slides']);
		await client.close();
	});

	it('reports the failed migration even when closing the client fails too', async () => {
		const client = new PGlite();
		vi.spyOn(client, 'close').mockRejectedValueOnce(new Error('close failed'));
		await expect(
			openMigrated(async () => client, [...migrations, { tag: '0001_broken', sql: 'select from missing;' }])
		).rejects.toThrow('Migration 0001_broken failed');
		await client.close();
	});

	it('closes the client when a migration fails, and the worker reports the error', async () => {
		const client = new PGlite();
		const scope = { postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
		void openInWorker(
			() =>
				openMigrated(async () => client, [...migrations, { tag: '0001_broken', sql: 'select from missing;' }]),
			scope as WorkerScope
		);
		await vi.waitFor(() =>
			expect(scope.postMessage).toHaveBeenCalledWith({
				type: 'open-failed',
				error: 'Migration 0001_broken failed: relation "missing" does not exist'
			})
		);
		expect(client.closed).toBe(true);
	});
});
