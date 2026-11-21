import { fileURLToPath } from 'node:url';
import { migrations } from 'virtual:migrations';
import { describe, expect, it } from 'vitest';
import { readMigrations } from '#lib/migrations-plugin.ts';

const folder = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('readMigrations', () => {
	it('reads each migration in the order of the journal', async () => {
		const read = await readMigrations(folder);
		expect(read[0]).toEqual({
			tag: '0000_create_migrations',
			sql: expect.stringContaining('CREATE TABLE "migrations"')
		});
		expect(read.map(({ tag }) => tag)).toEqual(read.map(({ tag }) => tag).toSorted((a, b) => a.localeCompare(b)));
	});

	it('watches the journal and every migration file', async () => {
		const watched: string[] = [];
		const read = await readMigrations(folder, (file) => {
			watched.push(file);
		});
		expect(watched).toEqual([`${folder}/meta/_journal.json`, ...read.map(({ tag }) => `${folder}/${tag}.sql`)]);
	});
});

describe('virtual:migrations', () => {
	it('serves the migrations from the drizzle folder', async () => {
		expect(migrations).toEqual(await readMigrations(folder));
	});
});
