import type { PGlite } from '@electric-sql/pglite';
import { migrations as built } from 'virtual:migrations';
import { migrate, type Migration } from '#lib/migrate.ts';

/**
 * Drops everything in the database, rows, tables, functions and triggers a test made, then applies `migrations`, so
 * the next test sees what a fresh client would. Starting PGlite takes seconds, so a test file shares one client and
 * calls this before each test.
 */
export async function resetTestDatabase(client: PGlite, migrations: readonly Migration[] = built): Promise<void> {
	await client.exec('drop schema public cascade; create schema public;');
	await migrate(client, migrations);
}
