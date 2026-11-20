import { describe, expect, it } from 'vitest';
import { boot, errorText, startBoot } from '#lib/boot.svelte.ts';

describe('startBoot', () => {
	it('is opening until the database opens, then ready', async () => {
		let resolve!: (value: string) => void;
		const started = startBoot(() => new Promise<string>((r) => (resolve = r)));
		expect(boot.state).toEqual({ status: 'opening' });
		resolve('database');
		await expect(started).resolves.toBe('database');
		expect(boot.state).toEqual({ status: 'ready' });
	});

	it('records the error text when opening fails', async () => {
		await expect(startBoot(() => Promise.reject(new Error('IndexedDB is unavailable')))).resolves.toBeUndefined();
		expect(boot.state).toEqual({ status: 'failed', error: 'IndexedDB is unavailable' });
	});
});

describe('errorText', () => {
	it('falls back to the error name or the thrown value', () => {
		expect(errorText(new DOMException('', 'QuotaExceededError'))).toBe('QuotaExceededError');
		expect(errorText('no worker')).toBe('no worker');
	});
});
