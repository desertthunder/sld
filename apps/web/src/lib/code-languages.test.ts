import { describe, expect, it } from 'vitest';
import { knownLanguage } from '#lib/code-languages.ts';

describe('knownLanguage', () => {
	it('knows only the languages Shiki bundles, never an object property', () => {
		expect(knownLanguage('Rust')).toBe('rust');
		for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'text', 'klingon']) {
			expect(knownLanguage(name), name).toBeUndefined();
		}
	});
});
