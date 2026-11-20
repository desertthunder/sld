import type { PGlite, PGliteInterface } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';

export type Database = PgliteDatabase;

/** Wraps any PGlite client, in a worker or in memory, with Drizzle. */
export function createDatabase(client: PGliteInterface): Database {
	// Drizzle types its client as `PGlite`, but only calls the query and transaction methods every PGlite client has.
	return drizzle({ client: client as PGlite });
}

const shared: { opening?: Promise<Database> } = {};

/**
 * Opens the deck database in a shared worker client. Every tab starts its own worker, and PGlite elects one tab's
 * worker to hold the database and serves the other tabs through it.
 */
export async function openDatabase(): Promise<Database> {
	shared.opening ??= connect();
	try {
		return await shared.opening;
	} catch (error) {
		shared.opening = undefined;
		throw error;
	}
}

async function connect(): Promise<Database> {
	const worker = new Worker(new URL('database-worker.ts', import.meta.url), { type: 'module', name: 'sld-database' });
	return createDatabase(await PGliteWorker.create(worker));
}
