import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	readAppScheme,
	refreshedAppScheme,
	refreshStoredAppScheme,
	storedAppScheme,
	writeAppScheme
} from '#lib/app-scheme.ts';
import { appSchemeKey } from '#lib/scheme-choice.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { schemeProperties } from '#lib/scheme-style.ts';

const { schemes } = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
const nord = schemes.find(({ slug }) => slug === 'nord')!;
const gruvbox = schemes.find(({ slug }) => slug === 'gruvbox-dark-hard')!;

function memoryStorage() {
	const items = new Map<string, string>();
	const storage = {
		getItem: (key: string) => items.get(key),
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key)
	};
	return storage as unknown as Storage;
}

const blocked = (): Storage => {
	throw new DOMException('Blocked', 'SecurityError');
};

describe('the stored app scheme', () => {
	it('holds the slug, variant and properties, and round-trips through storage', () => {
		const storage = memoryStorage();
		const stored = storedAppScheme(nord);
		expect(stored).toEqual({ slug: 'nord', variant: 'dark', properties: schemeProperties(nord) });
		writeAppScheme(() => storage, stored);
		expect(readAppScheme(() => storage)).toEqual(stored);
		writeAppScheme(() => storage, undefined);
		expect(storage.getItem(appSchemeKey)).toBeUndefined();
	});

	it('is absent when nothing is stored, or storage is blocked', () => {
		expect(readAppScheme(() => memoryStorage())).toBeUndefined();
		expect(readAppScheme(blocked)).toBeUndefined();
		expect(() => writeAppScheme(blocked, storedAppScheme(nord))).not.toThrow();
	});

	it('takes the compiled colors for its slug, and is dropped when the slug names no scheme', () => {
		const stale = { ...storedAppScheme(nord), properties: { '--base00': '#000000' } };
		expect(refreshedAppScheme(schemes, stale)).toEqual(storedAppScheme(nord));
		expect(refreshedAppScheme(schemes, { ...stale, slug: 'gone' })).toBeUndefined();
		expect(refreshedAppScheme(schemes, undefined)).toBeUndefined();
	});
});

const offline = () => Promise.reject(new Error('offline'));

describe('refreshing the stored app scheme', () => {
	const stale = { ...storedAppScheme(nord), properties: { '--base00': '#000000' } };

	it('stores and returns the compiled colors when they changed', async () => {
		const storage = memoryStorage();
		writeAppScheme(() => storage, stale);
		expect(
			await refreshStoredAppScheme(
				() => storage,
				async () => schemes
			)
		).toEqual(storedAppScheme(nord));
		expect(readAppScheme(() => storage)).toEqual(storedAppScheme(nord));
	});

	it('writes nothing when the stored scheme is up to date', async () => {
		const storage = memoryStorage();
		writeAppScheme(() => storage, storedAppScheme(nord));
		const setItem = vi.spyOn(storage, 'setItem');
		expect(
			await refreshStoredAppScheme(
				() => storage,
				async () => schemes
			)
		).toBe(false);
		expect(setItem).not.toHaveBeenCalled();
	});

	it('keeps a scheme chosen while the schemes load', async () => {
		const storage = memoryStorage();
		writeAppScheme(() => storage, stale);
		const load = async () => {
			writeAppScheme(() => storage, storedAppScheme(gruvbox));
			return schemes;
		};
		expect(await refreshStoredAppScheme(() => storage, load)).toBe(false);
		expect(readAppScheme(() => storage)?.slug).toBe('gruvbox-dark-hard');
	});

	it('keeps what is stored when the schemes fail to load', async () => {
		const storage = memoryStorage();
		writeAppScheme(() => storage, stale);
		expect(await refreshStoredAppScheme(() => storage, offline)).toBe(false);
		expect(readAppScheme(() => storage)).toEqual(stale);
	});
});
