import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { openInWorker } from '#lib/open-in-worker.ts';

await worker({ init: () => openInWorker(() => PGlite.create('idb://sld'), globalThis) });
