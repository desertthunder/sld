import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import type { OpenFailedMessage } from '#lib/database.ts';

await worker({
	async init() {
		try {
			return await PGlite.create('idb://sld');
		} catch (error) {
			// PGlite's worker drops this error, so the tab would wait forever for a database that never opens.
			postMessage({ type: 'open-failed', error } satisfies OpenFailedMessage);
			throw error;
		}
	}
});
