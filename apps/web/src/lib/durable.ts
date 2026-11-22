import type { PGlite } from '@electric-sql/pglite';

/**
 * Wraps `sync`, which writes the database's files to IndexedDB, so that the promise each call returns settles only
 * after a sync that started after the call has finished. Calls made while a sync runs share the next one, and two
 * syncs never overlap.
 */
export function serializeSyncs(sync: () => Promise<void>): () => Promise<void> {
	const state: { running?: Promise<void>; queued?: Promise<void> } = {};
	const run = async () => {
		try {
			await sync();
		} finally {
			state.running = undefined;
		}
	};
	const start = () => {
		const running = run();
		state.running = running;
		return running;
	};
	const startAfter = async (running: Promise<void>) => {
		try {
			await running;
		} catch {
			// The calls that waited on that sync hear its error; this one waits on the next.
		}
		state.queued = undefined;
		return start();
	};
	return () => {
		if (state.queued) return state.queued;
		if (!state.running) return start();
		const queued = startAfter(state.running);
		state.queued = queued;
		return queued;
	};
}

/**
 * Makes `client.syncToFs()` resolve only once IndexedDB holds every change made before the call. PGlite's own
 * `syncToFs` returns at once, without waiting, when another sync is already waiting to start, so a write could be
 * reported done before it reached IndexedDB. PGlite calls `syncToFs` after each statement outside a transaction, and
 * the database worker calls it for every tab, so both go through this.
 */
export function serializeSyncToFs<T extends Pick<PGlite, 'fs' | 'syncToFs'>>(client: T): T {
	const { fs } = client;
	if (!fs) throw new Error('The database has no filesystem to sync');
	client.syncToFs = serializeSyncs(() => fs.syncToFs());
	return client;
}
