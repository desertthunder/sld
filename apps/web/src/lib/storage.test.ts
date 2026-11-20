import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '#lib/storage.ts';

describe('requestPersistentStorage', () => {
	it('asks for persistence when storage is not yet persistent', async () => {
		const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
		await requestPersistentStorage(storage);
		expect(storage.persist).toHaveBeenCalledOnce();
	});

	it('does not ask again when storage is already persistent', async () => {
		const storage = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) };
		await requestPersistentStorage(storage);
		expect(storage.persist).not.toHaveBeenCalled();
	});

	it('does nothing when the browser has no storage manager', async () => {
		vi.stubGlobal('navigator', {});
		try {
			await expect(requestPersistentStorage()).resolves.toBeUndefined();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
