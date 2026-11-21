import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { Migration } from '#lib/migrate.ts';

const moduleId = 'virtual:migrations';
const resolvedId = `\0${moduleId}`;

/** Reads the migrations drizzle-kit wrote to `folder`, in the order of its journal. */
export async function readMigrations(folder: string, watch: (file: string) => void = () => {}): Promise<Migration[]> {
	type Journal = { entries: { idx: number; tag: string }[] };
	const journalFile = path.join(folder, 'meta', '_journal.json');
	watch(journalFile);
	const journal = JSON.parse(await readFile(journalFile, 'utf8')) as Journal;
	const entries = journal.entries.toSorted((a, b) => a.idx - b.idx);
	return Promise.all(
		entries.map(async ({ tag }) => {
			const file = path.join(folder, `${tag}.sql`);
			watch(file);
			return { tag, sql: await readFile(file, 'utf8') };
		})
	);
}

/**
 * Serves the migrations in `folder` as the module `virtual:migrations`. Drizzle's migrator reads them from disk with
 * Node, which the browser does not have, so the build bundles them instead.
 */
export function migrationsPlugin(folder: string): Plugin {
	return {
		name: 'sld-migrations',
		resolveId(source) {
			return source === moduleId ? resolvedId : undefined;
		},
		async load(id) {
			if (id !== resolvedId) return;
			// eslint-disable-next-line unicorn/no-this-outside-of-class -- Vite passes the plugin context as `this`.
			const migrations = await readMigrations(folder, (file) => this.addWatchFile(file));
			return `export const migrations = ${JSON.stringify(migrations)};`;
		}
	};
}
