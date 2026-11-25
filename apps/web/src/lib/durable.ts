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
 * reported done before it reached IndexedDB. PGlite calls `syncToFs` after each statement outside a transaction and
 * after each `BEGIN`, in this worker and in every tab it serves, so all of those go through this.
 */
export function serializeSyncToFs<T extends Pick<PGlite, 'fs' | 'syncToFs'>>(client: T): T {
	const { fs } = client;
	if (!fs) throw new Error('The database has no filesystem to sync');
	client.syncToFs = serializeSyncs(() => fs.syncToFs());
	return client;
}

/**
 * Makes `client` skip the sync to IndexedDB that PGlite runs after each wire protocol message, so only a `syncToFs()`
 * call syncs, and holds each message until no sync runs. A tab's PGlite client sends each statement as several
 * messages, and the worker synced after every one, so one read waited on many whole syncs. The client still asks for a
 * sync after each statement outside a transaction and after each `BEGIN`, so a read waits on one or two, and nothing
 * syncs after a `COMMIT`: `writeDurably` makes a write survive.
 *
 * A sync lists the changed files, waits on IndexedDB, then reads them, so a message run in that wait, such as another
 * tab's next statement in a transaction, could leave IndexedDB holding files from two moments. Every sync here starts
 * from a tab's own request, which a lock across tabs could leave held by a tab that closed, so messages wait here.
 */
export function syncOnlyWhenAsked<T extends Pick<PGlite, 'execProtocolRaw' | 'execProtocolRawStream' | 'syncToFs'>>(
	client: T
): T {
	const state: { syncing?: Promise<void> } = {};
	const sync = client.syncToFs.bind(client);
	const raw = client.execProtocolRaw.bind(client);
	const rawStream = client.execProtocolRawStream.bind(client);
	client.syncToFs = () => {
		const syncing = sync();
		state.syncing = syncing;
		void (async () => {
			try {
				await syncing;
			} catch {
				// The sync's caller hears its error.
			} finally {
				if (state.syncing === syncing) state.syncing = undefined;
			}
		})();
		return syncing;
	};
	// PGlite runs a message synchronously once called, so no sync can start between this wait and the message.
	const noSync = async () => {
		while (state.syncing) {
			try {
				await state.syncing;
			} catch {
				// The sync's caller hears its error.
			}
		}
	};
	client.execProtocolRaw = async (message, options) => {
		await noSync();
		return raw(message, { ...options, syncToFs: false });
	};
	client.execProtocolRawStream = async (message, options) => {
		await noSync();
		return rawStream(message, { ...options, syncToFs: false });
	};
	return client;
}
