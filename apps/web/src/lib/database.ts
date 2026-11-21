import type { PGlite } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrations } from 'virtual:migrations';
import {
	migrationChannelName,
	missingMigrations,
	OutdatedDatabaseError,
	type Migration,
	type MigrationProgress
} from '#lib/migrate.ts';

/** The PGlite clients the app uses: the shared one in a worker, or one in memory. */
export type Client = PGlite | PGliteWorker;

/** A Drizzle database, with the client it wraps as `$client`. */
export type Database = PgliteDatabase & { $client: Client };

/** Wraps any PGlite client, in a worker or in memory, with Drizzle. */
export function createDatabase(client: Client): Database {
	// Drizzle types its client as `PGlite`, but only calls the query and transaction methods every PGlite client has.
	return drizzle({ client: client as PGlite });
}

/**
 * Runs `write` against `database` and resolves once IndexedDB holds everything it wrote, so a reload or a closed tab
 * keeps it. Report a write saved only once this resolves.
 */
export async function writeDurably<T>(database: Database, write: (database: Database) => Promise<T>): Promise<T> {
	const result = await write(database);
	await database.$client.syncToFs();
	return result;
}

/**
 * Asks the database to sync to IndexedDB whenever the page is hidden or about to unload. Browsers may stop a hidden or
 * closing tab before the sync finishes, so this only narrows the window for a write still in flight; `writeDurably` is
 * what makes a saved write survive.
 */
export function syncWhenHidden(
	client: Pick<Client, 'syncToFs'>,
	page: Pick<Window, 'addEventListener'>,
	document: Pick<Document, 'addEventListener' | 'visibilityState'>
): void {
	const sync = () => void client.syncToFs().catch(() => {});
	page.addEventListener('pagehide', sync);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') sync();
	});
}

/** What the database worker posts, with the error as plain text, when this tab's worker cannot open the database. */
export type OpenFailedMessage = { type: 'open-failed'; error: string };

// PGlite elects a leader among workers with the same id, which defaults to the worker's URL. The build hashes that URL,
// so tabs on two versions of the app would each elect a leader and both open `idb://sld`.
const electionId = 'sld';

const shared: { opening?: Promise<Database> } = {};

/**
 * Opens the deck database in a shared worker client. Every tab starts its own worker, and PGlite elects one tab's
 * worker to hold the database and serves the other tabs through it. That worker migrates the database before any tab
 * can use it, and `onProgress` hears how far it has got. `onLost` hears of a failure after it opened. When the elected
 * worker runs older code, so the database lacks one of this build's migrations, it rejects with an
 * `OutdatedDatabaseError` without having written to it.
 */
export async function openDatabase(
	onLost: (error: unknown) => void = () => {},
	onProgress: (progress: MigrationProgress) => void = () => {}
): Promise<Database> {
	const progress = new BroadcastChannel(migrationChannelName);
	progress.addEventListener('message', (event: MessageEvent<MigrationProgress>) => onProgress(event.data));
	shared.opening ??= openShared((error) => {
		shared.opening = undefined;
		onLost(error);
	});
	try {
		return await shared.opening;
	} catch (error) {
		shared.opening = undefined;
		throw error;
	} finally {
		progress.close();
	}
}

async function openShared(onLost: (error: unknown) => void): Promise<Database> {
	const database = await connect(
		new Worker(new URL('database-worker.ts', import.meta.url), { type: 'module', name: 'sld-database' }),
		migrations,
		onLost
	);
	syncWhenHidden(database.$client, globalThis, document);
	return database;
}

/**
 * Connects through `worker` once the database is open, and rejects if the worker fails to load or to open it. A later
 * failure, such as this tab's worker taking over from a closed tab and failing to open the database, goes to `onLost`.
 * Either way the worker stops, so another tab's worker can take over. It also rejects, with an `OutdatedDatabaseError`,
 * when the database lacks any of `migrations`.
 */
export async function connect(
	worker: Worker,
	migrations: readonly Migration[],
	onLost: (error: unknown) => void = () => {}
): Promise<Database> {
	const { promise: failed, reject: rejectOpening } = Promise.withResolvers<never>();
	const state: { client?: PGliteWorker; isOpen: boolean; isStopped: boolean } = { isOpen: false, isStopped: false };
	const fail = (error: unknown) => {
		if (state.isStopped) return;
		state.isStopped = true;
		if (state.client) void state.client.close();
		else worker.terminate();
		if (state.isOpen) onLost(error);
		else rejectOpening(error);
	};
	worker.addEventListener('error', (event) => {
		fail(
			new Error(
				event.message || (state.isOpen ? 'The database worker stopped' : 'The database worker failed to load')
			)
		);
	});
	worker.addEventListener('message', (event: MessageEvent<OpenFailedMessage | undefined>) => {
		if (event.data?.type === 'open-failed') fail(new Error(event.data.error));
	});
	state.client = await Promise.race([PGliteWorker.create(worker, { id: electionId }), failed]);
	await Promise.race([state.client.waitReady, failed]);
	// The elected worker migrates with its own code, which may be older than this tab's after a deploy.
	let missing: string[];
	try {
		missing = await Promise.race([missingMigrations(state.client, migrations), failed]);
	} catch (error) {
		fail(error);
		return failed;
	}
	if (missing.length > 0) {
		fail(new OutdatedDatabaseError(missing));
		return failed;
	}
	state.isOpen = true;
	return createDatabase(state.client);
}
