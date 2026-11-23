import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	countText,
	defaultSchemes,
	filterSchemes,
	lowContrastTip,
	moveFocus,
	ownSchemeNote,
	parseStoredAppScheme,
	resolveScheme,
	searchPlaceholder,
	sortSchemes,
	swatchSlots
} from '#lib/scheme-choice.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';

const { schemes } = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
const names = (list: { name: string }[]) => list.map(({ name }) => name);

describe('resolveScheme', () => {
	it('finds the scheme a slug names', () => {
		expect(resolveScheme(schemes, 'nord', 'dark').name).toBe('Nord');
	});

	// eslint-disable-next-line unicorn/no-null -- A deck with no scheme stores null.
	it.each([null, undefined, '', 'no-such-scheme'])(
		'falls back to Oxocarbon in the preferred variant for %j',
		(slug) => {
			expect(resolveScheme(schemes, slug, 'dark').slug).toBe('oxocarbon-dark');
			expect(resolveScheme(schemes, slug, 'light').slug).toBe('oxocarbon-light');
		}
	);

	it('defaults to Oxocarbon Dark and Oxocarbon Light, and says so when they are missing', () => {
		expect(defaultSchemes).toEqual({ dark: 'oxocarbon-dark', light: 'oxocarbon-light' });
		expect(() => resolveScheme([], 'nord', 'dark')).toThrow('oxocarbon-dark');
	});
});

describe('the list', () => {
	const sorted = sortSchemes(schemes);

	it('sorts by name, ignoring case, and keeps low-contrast schemes in their place', () => {
		const sortedNames = names(sorted);
		expect(sortedNames).toEqual(sortedNames.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
		expect(sorted.filter(({ lowContrast }) => lowContrast)).toHaveLength(9);
		expect(sortedNames.indexOf('Tango')).toBeGreaterThan(sortedNames.indexOf('Solarized Dark'));
	});

	it('searches names ignoring case, accents and surrounding spaces', () => {
		expect(names(filterSchemes(sorted, '  GRUVBOX light, medium ', 'all'))).toEqual(['Gruvbox light, medium']);
		const rose = filterSchemes(sorted, 'rose pine', 'all');
		expect(rose.length).toBeGreaterThan(0);
		expect(names(rose).every((name) => name.startsWith('Rosé Pine'))).toBe(true);
	});

	it('filters by variant', () => {
		const light = filterSchemes(sorted, 'gruv', 'light');
		expect(light.length).toBeGreaterThan(0);
		expect(light.every(({ variant }) => variant === 'light')).toBe(true);
		expect(filterSchemes(sorted, '', 'all')).toHaveLength(schemes.length);
		expect(filterSchemes(sorted, '', 'dark').length + filterSchemes(sorted, '', 'light').length).toBe(
			schemes.length
		);
	});

	it('counts the schemes, or how many a search or filter shows', () => {
		expect(searchPlaceholder(375)).toBe('Search 375 schemes');
		expect(countText(375, 375, false)).toBe('375 schemes');
		expect(countText(4, 375, true)).toBe('4 of 375 schemes');
	});

	it('shows eight swatches per row: background, body, base07 and five accents', () => {
		expect(swatchSlots).toEqual(['00', '05', '07', '0D', '0E', '0B', '0A', '08']);
	});

	it('explains the low contrast mark by name', () => {
		expect(lowContrastTip('Tango')).toBe(
			"Body text, muted text or links in Tango can't reach 4.5:1 on its backgrounds. Fine for a quick look, hard to read on a projector."
		);
	});

	it('names the scheme a slide keeps for itself', () => {
		expect(ownSchemeNote('Gruvbox Dark Hard')).toBe('This slide sets its own scheme, Gruvbox Dark Hard');
	});
});

describe('moveFocus', () => {
	it.each([
		['ArrowDown', 3, 4],
		['ArrowUp', 3, 2],
		['ArrowDown', 19, 19],
		['ArrowUp', 0, 0],
		['ArrowDown', -1, 0],
		['ArrowUp', -1, 0],
		['PageDown', 3, 13],
		['PageDown', 15, 19],
		['PageUp', 3, 0],
		['Home', 7, 0],
		['End', 7, 19]
	])('moves %s from %i to %i of 20', (key, from, to) => {
		expect(moveFocus(key, from, 20)).toBe(to);
	});

	it('ignores other keys and empty lists', () => {
		expect(moveFocus('a', 3, 20)).toBeUndefined();
		expect(moveFocus('constructor', 3, 20)).toBeUndefined();
		expect(moveFocus('ArrowDown', -1, 0)).toBeUndefined();
	});
});

describe('parseStoredAppScheme', () => {
	const stored = { slug: 'nord', variant: 'dark', properties: { '--base00': '#2e3440', '--bg': 'var(--base00)' } };

	it('reads what the app stores', () => {
		expect(parseStoredAppScheme(JSON.stringify(stored))).toEqual(stored);
	});

	it.each([
		undefined,
		'',
		'not json',
		'null',
		'"nord"',
		JSON.stringify({ ...stored, slug: '' }),
		JSON.stringify({ ...stored, variant: 'dim' }),
		JSON.stringify({ ...stored, properties: 'none' }),
		JSON.stringify({ ...stored, properties: { color: 'red' } }),
		JSON.stringify({ ...stored, properties: { '--bg': 3 } })
	])('ignores %j', (text) => {
		expect(parseStoredAppScheme(text)).toBeUndefined();
	});
});
