import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';

await worker({
	async init() {
		return new PGlite('idb://sld');
	}
});
