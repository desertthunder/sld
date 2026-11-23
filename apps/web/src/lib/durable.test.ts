import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { serializeSyncs, serializeSyncToFs } from '#lib/durable.ts';

function controlledSync() {
	const runs: PromiseWithResolvers<void>[] = [];
	const sync = vi.fn(() => {
		const run = Promise.withResolvers<void>();
		runs.push(run);
		return run.promise;
	});
	return { sync, runs };
}

function settled(promise: Promise<unknown>) {
	const state = { isSettled: false };
	void (async () => {
		try {
			await promise;
		} catch {
			// Settled either way.
		} finally {
			state.isSettled = true;
		}
	})();
	return state;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('serializeSyncs', () => {
	it('starts a sync at once when none is running', async () => {
		const { sync, runs } = controlledSync();
		const call = serializeSyncs(sync)();
		expect(sync).toHaveBeenCalledOnce();
		runs[0].resolve();
		await expect(call).resolves.toBeUndefined();
	});

	it('makes a call during a sync wait for the next sync, which starts after the running one', async () => {
		const { sync, runs } = controlledSync();
		const syncToFs = serializeSyncs(sync);
		const first = syncToFs();
		const second = settled(syncToFs());
		expect(sync).toHaveBeenCalledOnce();
		runs[0].resolve();
		await first;
		await tick();
		expect(second.isSettled).toBe(false);
		expect(sync).toHaveBeenCalledTimes(2);
		runs[1].resolve();
		await tick();
		expect(second.isSettled).toBe(true);
	});

	it('shares one queued sync between every call made while a sync runs', async () => {
		const { sync, runs } = controlledSync();
		const syncToFs = serializeSyncs(sync);
		void syncToFs();
		const second = syncToFs();
		const third = settled(syncToFs());
		runs[0].resolve();
		await tick();
		expect(third.isSettled).toBe(false);
		runs[1].resolve();
		await second;
		await tick();
		expect(third.isSettled).toBe(true);
		expect(sync).toHaveBeenCalledTimes(2);
	});

	it('queues a fresh sync for a call made after the queued sync started', async () => {
		const { sync, runs } = controlledSync();
		const syncToFs = serializeSyncs(sync);
		void syncToFs();
		void syncToFs();
		runs[0].resolve();
		await tick();
		const late = settled(syncToFs());
		runs[1].resolve();
		await tick();
		expect(late.isSettled).toBe(false);
		expect(sync).toHaveBeenCalledTimes(3);
		runs[2].resolve();
		await tick();
		expect(late.isSettled).toBe(true);
	});

	it('rejects only the calls waiting on a failed sync, and still runs the queued one', async () => {
		const { sync, runs } = controlledSync();
		const syncToFs = serializeSyncs(sync);
		const first = syncToFs();
		const second = syncToFs();
		runs[0].reject(new Error('IndexedDB is full'));
		await expect(first).rejects.toThrow('IndexedDB is full');
		await tick();
		runs[1].resolve();
		await expect(second).resolves.toBeUndefined();
	});
});

describe('serializeSyncToFs', { timeout: 30_000 }, () => {
	it("routes every sync of the client, PGlite's own included, through its filesystem one at a time", async () => {
		const client = await PGlite.create();
		const fsSync = vi.spyOn(client.fs!, 'syncToFs');
		serializeSyncToFs(client);
		await client.query('select 1');
		expect(fsSync).toHaveBeenCalledOnce();
		await Promise.all([client.syncToFs(), client.syncToFs(), client.syncToFs()]);
		expect(fsSync).toHaveBeenCalledTimes(3);
		await client.close();
	});

	it("makes a statement's own sync wait while another sync is waiting to start", async () => {
		const client = await PGlite.create();
		const { fs } = client;
		const syncFiles = fs!.syncToFs.bind(fs);
		const held = Promise.withResolvers<void>();
		const fsSync = vi.spyOn(fs!, 'syncToFs').mockImplementationOnce(async () => {
			await held.promise;
			await syncFiles();
		});
		serializeSyncToFs(client);
		const running = client.syncToFs();
		await tick();
		const waiting = client.syncToFs();
		const query = settled(client.query('select 1'));
		await tick();
		expect(query.isSettled).toBe(false);
		held.resolve();
		await Promise.all([running, waiting]);
		await vi.waitFor(() => expect(query.isSettled).toBe(true));
		expect(fsSync).toHaveBeenCalledTimes(2);
		await client.close();
	});
});
