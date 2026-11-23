import { describe, expect, it } from 'vitest';
import { listViewKey, parseListView, readListView, writeListView } from '#lib/slide-list-view.ts';

describe('parseListView', () => {
	it('reads headings only, and thumbnails for anything else', () => {
		expect(parseListView('headings')).toBe('headings');
		expect(parseListView('thumbnails')).toBe('thumbnails');
		expect(parseListView(undefined)).toBe('thumbnails');
		expect(parseListView('junk')).toBe('thumbnails');
	});
});

const blocked = () => {
	throw new DOMException('Blocked', 'SecurityError');
};

describe('readListView and writeListView', () => {
	it('keep the chosen view under its key', () => {
		const stored = new Map<string, string>();
		const storage = {
			// eslint-disable-next-line unicorn/no-null -- Storage answers null for a key it doesn't hold.
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => void stored.set(key, value)
		};
		writeListView(() => storage, 'headings');
		expect(stored.get(listViewKey)).toBe('headings');
		expect(readListView(() => storage)).toBe('headings');
	});

	it('fall back to thumbnails, and keep quiet, when storage is blocked', () => {
		expect(readListView(blocked)).toBe('thumbnails');
		expect(() => writeListView(blocked, 'headings')).not.toThrow();
	});
});
