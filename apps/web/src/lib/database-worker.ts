import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { migrations } from 'virtual:migrations';
import { migrationChannelName, openMigrated } from '#lib/migrate.ts';
import { openInWorker } from '#lib/open-in-worker.ts';

const progress = new BroadcastChannel(migrationChannelName);

// PGlite calls `init` only in the elected worker, so one tab migrates and the others wait until it has. Each tab then
// checks that the elected worker's code applied this build's migrations.
await worker({
	init: () =>
		openInWorker(
			() =>
				openMigrated(
					() => PGlite.create('idb://sld'),
					migrations,
					(update) => progress.postMessage(update)
				),
			globalThis
		)
});
