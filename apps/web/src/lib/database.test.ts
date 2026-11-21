import { PGlite } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, createDatabase, openDatabase, syncWhenHidden, writeDurably, type Database } from '#lib/database.ts';
import { migrate, migrationChannelName, OutdatedDatabaseError, type Migration } from '#lib/migrate.ts';

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

describe('writeDurably', () => {
	it('resolves with what the write returns once the database has synced after it', async () => {
		const client = new PGlite();
		const events: string[] = [];
		vi.spyOn(client, 'syncToFs').mockImplementation(async () => {
			events.push('sync');
		});
		const saved = await writeDurably(createDatabase(client), async (database) => {
			await database.execute(sql`create table notes (body text not null)`);
			events.length = 0;
			events.push('write');
			return 'saved';
		});
		expect(saved).toBe('saved');
		expect(events).toEqual(['write', 'sync']);
		await client.close();
	});

	it('does not sync or report a write that failed', async () => {
		const client = new PGlite();
		const sync = vi.spyOn(client, 'syncToFs');
		await expect(
			writeDurably(createDatabase(client), async () => {
				throw new Error('constraint failed');
			})
		).rejects.toThrow('constraint failed');
		expect(sync).not.toHaveBeenCalled();
		await client.close();
	});
});

function hiddenPage() {
	const page = new EventTarget();
	const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
	const client = { syncToFs: vi.fn(async () => {}) };
	const stop = syncWhenHidden(client, page as Window, document as unknown as Document);
	return { page, document, client, stop };
}

describe('syncWhenHidden', () => {
	it('syncs when the page is about to unload', () => {
		const { page, client } = hiddenPage();
		page.dispatchEvent(new Event('pagehide'));
		expect(client.syncToFs).toHaveBeenCalledOnce();
	});

	it('syncs when the page is hidden, and not when it is shown again', () => {
		const { document, client } = hiddenPage();
		document.visibilityState = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		document.visibilityState = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		expect(client.syncToFs).toHaveBeenCalledOnce();
	});

	it('stops syncing once stopped', () => {
		const { page, document, client, stop } = hiddenPage();
		stop();
		page.dispatchEvent(new Event('pagehide'));
		document.visibilityState = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		expect(client.syncToFs).not.toHaveBeenCalled();
	});

	it('ignores a sync that fails while the page goes away', async () => {
		const { page, client } = hiddenPage();
		client.syncToFs.mockRejectedValueOnce(new Error('The database worker stopped'));
		page.dispatchEvent(new Event('pagehide'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(client.syncToFs).toHaveBeenCalledOnce();
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
		const connecting = connect(asWorker(worker), []);
		worker.send({ type: 'here' });
		worker.send({ type: 'open-failed', error: 'IndexedDB is unavailable' });
		await expect(connecting).rejects.toThrow('IndexedDB is unavailable');
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it('fails when the worker script does not load', async () => {
		const worker = new FakeWorker();
		const connecting = connect(asWorker(worker), []);
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

async function readyWorker(onLost?: (error: unknown) => void, migrations: readonly Migration[] = []) {
	const worker = new FakeWorker();
	const outcome = { isSettled: false };
	const connecting = connect(asWorker(worker), migrations, onLost);
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
		worker.send({ type: 'open-failed', error: 'IndexedDB is unavailable' });
		await expect(connecting).rejects.toThrow('IndexedDB is unavailable');
		expect(worker.terminate).toHaveBeenCalledOnce();
		for (const channel of FakeChannel.open.values()) expect(channel.close).toHaveBeenCalled();
	});

	it('reports a failure after the database opened', async () => {
		const onLost = vi.fn();
		const { worker, connecting, tab } = await readyWorker(onLost);
		tab.send({ type: 'connected' });
		await connecting;
		worker.send({ type: 'open-failed', error: 'IndexedDB is unavailable' });
		expect(onLost).toHaveBeenCalledWith(new Error('IndexedDB is unavailable'));
		expect(worker.terminate).toHaveBeenCalledOnce();
	});
});

const create: Migration = { tag: '0000_create', sql: 'create table migrations (tag text primary key);' };
const notes: Migration = { tag: '0001_notes', sql: 'create table notes (id serial primary key, body text not null);' };
const titles: Migration = { tag: '0002_titles', sql: `alter table notes add column title text not null default '';` };

// This tab's worker is never elected here, as when another tab holds the lock: the tab reaches the database that tab's
// worker opened, played by an in-memory PGlite migrated with that tab's migrations.
describe('connect to a database another tab elected and migrated', () => {
	let leader: PGlite;

	beforeEach(async () => {
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
		leader = new PGlite();
		await migrate(leader, [create, notes]);
		await leader.query(`insert into notes (body) values ('first slide')`);
		vi.spyOn(PGliteWorker.prototype, 'query').mockImplementation((query, parameters) =>
			leader.query(query, parameters)
		);
		vi.spyOn(PGliteWorker.prototype, 'exec').mockRejectedValue(new Error('exec'));
		vi.spyOn(PGliteWorker.prototype, 'transaction').mockRejectedValue(new Error('transaction'));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		await leader.close();
	});

	it('refuses a database one migration behind this build, and leaves it as it was', async () => {
		const onLost = vi.fn();
		const { worker, connecting, tab } = await readyWorker(onLost, [create, notes, titles]);
		tab.send({ type: 'connected' });
		await expect(connecting).rejects.toEqual(new OutdatedDatabaseError([titles.tag]));
		for (const [query] of vi.mocked(PGliteWorker.prototype.query).mock.calls)
			expect(query).toMatch(/^\s*select\b/i);
		expect(PGliteWorker.prototype.exec).not.toHaveBeenCalled();
		expect(PGliteWorker.prototype.transaction).not.toHaveBeenCalled();
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(onLost).not.toHaveBeenCalled();
		const applied = await leader.query('select tag from migrations order by tag');
		expect(applied.rows).toEqual([{ tag: create.tag }, { tag: notes.tag }]);
		const decks = await leader.query('select * from notes');
		expect(decks.rows).toEqual([{ id: 1, body: 'first slide' }]);
	});

	it('stops the worker when the check fails, as when the leader changes during it', async () => {
		vi.mocked(PGliteWorker.prototype.query).mockImplementation((query, parameters) =>
			query.includes('migrations') ? Promise.reject(new Error('Leader changed')) : leader.query(query, parameters)
		);
		const onLost = vi.fn();
		const { worker, connecting, tab } = await readyWorker(onLost, [create, notes, titles]);
		tab.send({ type: 'connected' });
		await expect(connecting).rejects.toThrow('Leader changed');
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(onLost).not.toHaveBeenCalled();
	});

	it('opens a database with every migration this build carries', async () => {
		const { connecting, tab } = await readyWorker(undefined, [create, notes]);
		tab.send({ type: 'connected' });
		await expect(connecting).resolves.toBeDefined();
	});

	it('opens a database a newer tab migrated further, so the older tab keeps working', async () => {
		await migrate(leader, [create, notes, titles]);
		const { connecting, tab } = await readyWorker(undefined, [create, notes]);
		tab.send({ type: 'connected' });
		await expect(connecting).resolves.toBeDefined();
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
		const second = openDatabase();
		expect(FakeWorker.created).toHaveLength(2);
		FakeWorker.created[1].dispatchEvent(new Event('error'));
		await expect(second).rejects.toThrow();
	});

	it('passes on the migration progress the elected worker posts while opening', async () => {
		vi.stubGlobal('Worker', FakeWorker);
		const onProgress = vi.fn();
		const opening = openDatabase(undefined, onProgress);
		const worker = new BroadcastChannel(migrationChannelName);
		worker.postMessage({ applied: 0, total: 1 });
		await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({ applied: 0, total: 1 }));
		FakeWorker.created[0].dispatchEvent(new Event('error'));
		await expect(opening).rejects.toThrow();
		worker.postMessage({ applied: 1, total: 1 });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(onProgress).toHaveBeenCalledOnce();
		worker.close();
	});
});
