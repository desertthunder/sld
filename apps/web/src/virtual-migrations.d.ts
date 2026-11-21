declare module 'virtual:migrations' {
	import type { Migration } from '#lib/migrate.ts';

	export const migrations: readonly Migration[];
}
