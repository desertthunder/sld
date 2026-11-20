import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '#lib/database.ts';

describe('createDatabase', () => {
	let client: PGlite;
	let database: Database;

	beforeEach(() => {
		client = new PGlite();
		database = createDatabase(client);
	});

	afterEach(async () => {
		await client.close();
	});

	it('runs queries through Drizzle', async () => {
		const result = await database.execute<{ answer: number }>(sql`select 1 + 1 as answer`);
		expect(result.rows).toEqual([{ answer: 2 }]);
	});

	it('reads back a written row', async () => {
		await database.execute(sql`create table notes (id serial primary key, body text not null)`);
		await database.execute(sql`insert into notes (body) values (${'first slide'})`);
		const result = await database.execute<{ body: string }>(sql`select body from notes`);
		expect(result.rows).toEqual([{ body: 'first slide' }]);
	});

	it('rolls back a failed transaction', async () => {
		await database.execute(sql`create table notes (body text not null)`);
		await expect(
			database.transaction(async (tx) => {
				await tx.execute(sql`insert into notes (body) values ('kept?')`);
				throw new Error('abort');
			})
		).rejects.toThrow('abort');
		const result = await database.execute(sql`select * from notes`);
		expect(result.rows).toEqual([]);
	});
});
