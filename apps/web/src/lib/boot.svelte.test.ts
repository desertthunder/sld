import { describe, expect, it } from 'vitest';
import { boot, startBoot } from '#lib/boot.svelte.ts';
import { OutdatedDatabaseError } from '#lib/migrate.ts';

describe('startBoot', () => {
	it('is opening until the database opens, then ready', async () => {
		let resolve!: (value: string) => void;
		const started = startBoot(() => new Promise<string>((r) => (resolve = r)));
		expect(boot.state).toEqual({ status: 'opening' });
		resolve('database');
		await expect(started).resolves.toBe('database');
		expect(boot.state).toEqual({ status: 'ready' });
	});

	it('records migration progress while opening', async () => {
		let resolve!: (value: string) => void;
		const started = startBoot((_lost, progress) => {
			progress({ applied: 1, total: 2 });
			return new Promise<string>((r) => (resolve = r));
		});
		expect(boot.state).toEqual({ status: 'opening', migrations: { applied: 1, total: 2 } });
		resolve('database');
		await started;
		expect(boot.state).toEqual({ status: 'ready' });
	});

	it('records the error text when opening fails', async () => {
		await expect(startBoot(() => Promise.reject(new Error('IndexedDB is unavailable')))).resolves.toBeUndefined();
		expect(boot.state).toEqual({ status: 'failed', error: 'IndexedDB is unavailable' });
	});

	it('is outdated, not failed, when the database lacks a migration this tab carries', async () => {
		await expect(
			startBoot(() => Promise.reject(new OutdatedDatabaseError(['0001_notes'])))
		).resolves.toBeUndefined();
		expect(boot.state).toEqual({ status: 'outdated' });
	});

	it('records a failure reported after the database opened', async () => {
		let lose!: (error: unknown) => void;
		await startBoot(async (lost) => {
			lose = lost;
			return 'database';
		});
		expect(boot.state).toEqual({ status: 'ready' });
		lose(new Error('The database worker stopped'));
		expect(boot.state).toEqual({ status: 'failed', error: 'The database worker stopped' });
	});
});
