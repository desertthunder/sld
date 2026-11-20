import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, createDatabase, openDatabase, type Database } from '#lib/database.ts';

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

class FakeWorker extends EventTarget {
	static created: FakeWorker[] = [];
	postMessage = vi.fn();
	terminate = vi.fn();

	constructor() {
		super();
		FakeWorker.created.push(this);
	}

	send(data: unknown) {
		this.dispatchEvent(new MessageEvent('message', { data }));
	}
}

function asWorker(fake: FakeWorker): Worker {
	return fake as unknown as Worker;
}

describe('connect', () => {
	it('fails with the error when the worker cannot open the database', async () => {
		const worker = new FakeWorker();
		const connecting = connect(asWorker(worker));
		worker.send({ type: 'here' });
		worker.send({ type: 'open-failed', error: new Error('IndexedDB is unavailable') });
		await expect(connecting).rejects.toThrow('IndexedDB is unavailable');
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it('fails when the worker script does not load', async () => {
		const worker = new FakeWorker();
		const connecting = connect(asWorker(worker));
		worker.dispatchEvent(Object.assign(new Event('error'), { message: '' }));
		await expect(connecting).rejects.toThrow('The database worker failed to load');
		expect(worker.terminate).toHaveBeenCalledOnce();
	});
});

describe('openDatabase', () => {
	beforeEach(() => {
		FakeWorker.created = [];
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('starts a new worker after a failed open', async () => {
		vi.stubGlobal('Worker', FakeWorker);
		const first = openDatabase();
		FakeWorker.created[0].dispatchEvent(new Event('error'));
		await expect(first).rejects.toThrow('The database worker failed to load');
		void openDatabase();
		expect(FakeWorker.created).toHaveLength(2);
	});
});
