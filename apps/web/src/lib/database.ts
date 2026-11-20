import type { PGlite, PGliteInterface } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';

export type Database = PgliteDatabase;

/** Wraps any PGlite client, in a worker or in memory, with Drizzle. */
export function createDatabase(client: PGliteInterface): Database {
	// Drizzle types its client as `PGlite`, but only calls the query and transaction methods every PGlite client has.
	return drizzle({ client: client as PGlite });
}

/** What the database worker posts when this tab's worker holds the database and cannot open it. */
export type OpenFailedMessage = { type: 'open-failed'; error: unknown };

const shared: { opening?: Promise<Database> } = {};

/**
 * Opens the deck database in a shared worker client. Every tab starts its own worker, and PGlite elects one tab's
 * worker to hold the database and serves the other tabs through it.
 */
export async function openDatabase(): Promise<Database> {
	shared.opening ??= connect(
		new Worker(new URL('database-worker.ts', import.meta.url), { type: 'module', name: 'sld-database' })
	);
	try {
		return await shared.opening;
	} catch (error) {
		shared.opening = undefined;
		throw error;
	}
}

/** Connects through `worker` once the database is open, and rejects if the worker fails to load or to open it. */
export async function connect(worker: Worker): Promise<Database> {
	const failed = new Promise<never>((_resolve, reject) => {
		worker.addEventListener('error', (event) => {
			reject(new Error(event.message || 'The database worker failed to load'));
		});
		worker.addEventListener('message', (event: MessageEvent<OpenFailedMessage | undefined>) => {
			if (event.data?.type === 'open-failed') reject(event.data.error);
		});
	});
	try {
		const client = await Promise.race([PGliteWorker.create(worker), failed]);
		await Promise.race([client.waitReady, failed]);
		return createDatabase(client);
	} catch (error) {
		worker.terminate();
		throw error;
	}
}
