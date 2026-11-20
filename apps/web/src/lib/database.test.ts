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

class FakeChannel extends EventTarget {
	static open = new Map<string, FakeChannel>();
	postMessage = vi.fn();
	close = vi.fn();

	constructor(readonly name: string) {
		super();
		FakeChannel.open.set(name, this);
	}

	send(data: unknown) {
		this.dispatchEvent(new MessageEvent('message', { data }));
	}
}

function tabChannel(): FakeChannel | undefined {
	return FakeChannel.open.values().find((channel) => channel.name.startsWith('pglite-tab:'));
}

async function readyWorker(onLost?: (error: unknown) => void) {
	const worker = new FakeWorker();
	const outcome = { isSettled: false };
	const connecting = connect(asWorker(worker), onLost);
	void connecting.then(() => (outcome.isSettled = true)).catch(() => (outcome.isSettled = true));
	worker.send({ type: 'here' });
	worker.send({ type: 'ready', id: 'sld' });
	await vi.waitFor(() => expect(tabChannel()).toBeDefined());
	return { worker, connecting, tab: tabChannel()!, outcome };
}

describe('connect after the worker is ready', () => {
	beforeEach(() => {
		FakeChannel.open.clear();
		vi.stubGlobal('BroadcastChannel', FakeChannel);
		vi.stubGlobal('navigator', {
			locks: {
				request: (_name: string, hold: () => Promise<void>) => {
					void hold();
					return Promise.resolve();
				}
			}
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('asks every version of the app to elect one leader for the database', async () => {
		const { worker, connecting, tab } = await readyWorker();
		expect(worker.postMessage).toHaveBeenCalledWith({ type: 'init', options: { id: 'sld' } });
		tab.send({ type: 'connected' });
		await connecting;
	});

	it('waits for the tab to connect to the database', async () => {
		const { connecting, tab, outcome } = await readyWorker();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(outcome.isSettled).toBe(false);
		tab.send({ type: 'connected' });
		await expect(connecting).resolves.toBeDefined();
	});

	it('fails and closes the client when the elected worker cannot open the database', async () => {
		const { worker, connecting } = await readyWorker();
		worker.send({ type: 'open-failed', error: new Error('IndexedDB is unavailable') });
		await expect(connecting).rejects.toThrow('IndexedDB is unavailable');
		expect(worker.terminate).toHaveBeenCalledOnce();
		for (const channel of FakeChannel.open.values()) expect(channel.close).toHaveBeenCalled();
	});

	it('reports a failure after the database opened', async () => {
		const onLost = vi.fn();
		const { worker, connecting, tab } = await readyWorker(onLost);
		tab.send({ type: 'connected' });
		await connecting;
		worker.send({ type: 'open-failed', error: new Error('IndexedDB is unavailable') });
		expect(onLost).toHaveBeenCalledWith(new Error('IndexedDB is unavailable'));
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
