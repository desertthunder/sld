import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrations } from 'virtual:migrations';
import { describe, expect, it } from 'vitest';
import { readMigrations } from '#lib/migrations-plugin.ts';

const folder = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('readMigrations', () => {
	it('reads each migration with its tag and SQL', async () => {
		const read = await readMigrations(folder);
		expect(read[0]).toEqual({
			tag: '0000_create_migrations',
			sql: expect.stringContaining('CREATE TABLE "migrations"')
		});
	});

	it('orders the migrations by their journal index, not by where the journal lists them', async () => {
		const scratch = await mkdtemp(path.join(tmpdir(), 'sld-migrations-'));
		try {
			await mkdir(path.join(scratch, 'meta'));
			const entries = [
				{ idx: 1, tag: '0001_second' },
				{ idx: 0, tag: '0000_first' }
			];
			await writeFile(path.join(scratch, 'meta', '_journal.json'), JSON.stringify({ entries }));
			for (const { tag } of entries) await writeFile(path.join(scratch, `${tag}.sql`), `-- ${tag}`);
			expect(await readMigrations(scratch)).toEqual([
				{ tag: '0000_first', sql: '-- 0000_first' },
				{ tag: '0001_second', sql: '-- 0001_second' }
			]);
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
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
