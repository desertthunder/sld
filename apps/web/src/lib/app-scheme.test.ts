import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAppScheme, refreshedAppScheme, storedAppScheme, writeAppScheme } from '#lib/app-scheme.ts';
import { appSchemeKey } from '#lib/scheme-choice.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { schemeProperties } from '#lib/scheme-style.ts';

const { schemes } = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
const nord = schemes.find(({ slug }) => slug === 'nord')!;

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
