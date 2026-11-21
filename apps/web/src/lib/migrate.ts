import type { PGliteInterface } from '@electric-sql/pglite';
import { errorText } from '#lib/error-text.ts';

/** A migration drizzle-kit wrote: its tag from the journal, such as `0000_create_migrations`, and its SQL. */
export type Migration = { tag: string; sql: string };

/** How many of the migrations this open needs have been applied so far. */
export type MigrationProgress = { applied: number; total: number };

/** The channel the elected worker posts `MigrationProgress` on, so every tab waiting for the database hears it. */
export const migrationChannelName = 'sld-migrations';

type Client = Pick<PGliteInterface, 'query' | 'transaction'>;

/**
 * Applies, in order, each of `migrations` that the `migrations` table does not list, each in its own transaction that
 * also records it. The first migration creates that table, so a fresh database has none of them. A failed migration
 * rolls back and stops the rest.
 */
export async function migrate(
	client: Client,
	migrations: readonly Migration[],
	onProgress: (progress: MigrationProgress) => void = () => {}
): Promise<void> {
	const applied = await appliedTags(client);
	const pending = migrations.filter(({ tag }) => !applied.has(tag));
	if (pending.length === 0) return;
	onProgress({ applied: 0, total: pending.length });
	for (const [index, { tag, sql }] of pending.entries()) {
		try {
			await client.transaction(async (tx) => {
				await tx.exec(sql);
				await tx.query('insert into migrations (tag) values ($1)', [tag]);
			});
		} catch (error) {
			throw new Error(`Migration ${tag} failed: ${errorText(error)}`, { cause: error });
		}
		onProgress({ applied: index + 1, total: pending.length });
	}
}

async function appliedTags(client: Client): Promise<Set<string>> {
	const table = await client.query<{ exists: boolean }>(
		`select to_regclass('public.migrations') is not null as exists`
	);
	if (!table.rows[0]?.exists) return new Set();
	const rows = await client.query<{ tag: string }>('select tag from migrations');
	return new Set(rows.rows.map(({ tag }) => tag));
}

/** Opens a client with `open` and migrates it, closing it again if a migration fails. */
export async function openMigrated<T extends Client & Pick<PGliteInterface, 'close'>>(
	open: () => Promise<T>,
	migrations: readonly Migration[],
	onProgress?: (progress: MigrationProgress) => void
): Promise<T> {
	const client = await open();
	try {
		await migrate(client, migrations, onProgress);
		return client;
	} catch (error) {
		await client.close();
		throw error;
	}
}
