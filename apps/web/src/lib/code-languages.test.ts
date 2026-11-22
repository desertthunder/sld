import { describe, expect, it } from 'vitest';
import { knownLanguage, languageLabel } from '#lib/code-languages.ts';

describe('knownLanguage', () => {
	it('knows only the languages Shiki bundles, never an object property', () => {
		expect(knownLanguage('Rust')).toBe('rust');
		for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'text', 'klingon']) {
			expect(knownLanguage(name), name).toBeUndefined();
		}
	});
});

describe('languageLabel', () => {
	it('names a language as Shiki does, by its id or any alias, in any case', () => {
		expect(languageLabel('ts')).toBe('TypeScript');
		expect(languageLabel('TypeScript')).toBe('TypeScript');
		expect(languageLabel('go')).toBe('Go');
		expect(languageLabel('html')).toBe('HTML');
		expect(languageLabel('tsx')).toBe('TSX');
		expect(languageLabel('bash')).toBe('Shell');
		expect(languageLabel('cpp')).toBe('C++');
	});

	it('shows a language Shiki lacks as the fence wrote it, never an object property', () => {
		for (const name of ['klingon', 'Klingon', 'text', 'constructor', '__proto__', 'toString']) {
			expect(languageLabel(name), name).toBe(name);
		}
	});
});
