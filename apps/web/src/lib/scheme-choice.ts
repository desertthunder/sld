import type { Scheme, Variant } from '#lib/scheme-compiler.ts';

/** The schemes a deck or the app takes when none is chosen, or the chosen one is unknown, by the system's preference. */
export const defaultSchemes: Record<Variant, string> = { dark: 'oxocarbon-dark', light: 'oxocarbon-light' };

/** The scheme `slug` names, or the default for `preferred` when it is missing or names no scheme. */
export function resolveScheme(schemes: readonly Scheme[], slug: string | null | undefined, preferred: Variant): Scheme {
	const named = slug ? schemes.find((scheme) => scheme.slug === slug) : undefined;
	const fallback = schemes.find((scheme) => scheme.slug === defaultSchemes[preferred]);
	const scheme = named ?? fallback;
	if (!scheme) throw new Error(`The default scheme ${defaultSchemes[preferred]} is missing`);
	return scheme;
}

export const schemeFilters = ['all', 'dark', 'light'] as const;

/** Which variants the picker lists. */
export type SchemeFilter = (typeof schemeFilters)[number];

export const filterLabels: Record<SchemeFilter, string> = { all: 'All', dark: 'Dark', light: 'Light' };

export const variantLabels: Record<Variant, string> = { dark: 'Dark', light: 'Light' };

/** The slots a picker row shows, in order: background, body, the brightest foreground, then five accents. */
export const swatchSlots = ['00', '05', '07', '0D', '0E', '0B', '0A', '08'] as const;

/** The schemes sorted by name, as the picker lists them. */
export function sortSchemes(schemes: readonly Scheme[]): Scheme[] {
	return schemes.toSorted((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** The schemes whose name holds `query`, ignoring case, accents and spaces around it, of the variant `filter` picks. */
export function filterSchemes(schemes: readonly Scheme[], query: string, filter: SchemeFilter): Scheme[] {
	const needle = fold(query.trim());
	return schemes.filter(
		(scheme) => (filter === 'all' || scheme.variant === filter) && fold(scheme.name).includes(needle)
	);
}

function fold(text: string): string {
	return text
		.normalize('NFD')
		.replaceAll(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/** The search box's placeholder. */
export function searchPlaceholder(total: number): string {
	return `Search ${total} schemes`;
}

/** The line above the list: how many schemes there are, or how many of them a search or filter shows. */
export function countText(shown: number, total: number, isNarrowed: boolean): string {
	return isNarrowed ? `${shown} of ${total} schemes` : `${total} schemes`;
}

/** What a low-contrast scheme's row says when it has focus. */
export function lowContrastTip(name: string): string {
	return `Body text, muted text or links in ${name} can't reach 4.5:1 on its backgrounds. Fine for a quick look, hard to read on a projector.`;
}

export const lowContrastNote = 'Low contrast: some text falls below 4.5:1';

const pageSize = 10;

/** Where a key moves the focus in a list of `length` options from `index`, or undefined for a key that doesn't. */
export function moveFocus(key: string, index: number, length: number): number | undefined {
	if (length === 0) return undefined;
	const last = length - 1;
	const moves: Record<string, number> = {
		ArrowDown: index + 1,
		ArrowUp: index - 1,
		PageDown: index + pageSize,
		PageUp: index - pageSize,
		Home: 0,
		End: last
	};
	return Object.hasOwn(moves, key) ? Math.min(Math.max(moves[key]!, 0), last) : undefined;
}

/** The `localStorage` key holding the app's scheme in this browser. */
export const appSchemeKey = 'sld:app-scheme';

/**
 * The app's scheme as this browser stores it: its slug, and its variant and CSS properties, to apply before the schemes
 * load.
 */
export type StoredAppScheme = { slug: string; variant: Variant; properties: Record<string, string> };

const propertyName = /^--[\da-z-]+$/i;

/** Reads the stored app scheme, or undefined when there is none or it isn't usable. */
export function parseStoredAppScheme(text: string | null | undefined): StoredAppScheme | undefined {
	if (!text) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof value !== 'object' || value === null) return undefined;
	const { slug, variant, properties } = value as Record<string, unknown>;
	if (typeof slug !== 'string' || slug === '' || (variant !== 'dark' && variant !== 'light')) return undefined;
	if (typeof properties !== 'object' || properties === null) return undefined;
	const entries = Object.entries(properties);
	const isValid = entries.every(([name, css]) => propertyName.test(name) && typeof css === 'string');
	return isValid ? { slug, variant, properties: Object.fromEntries(entries) as Record<string, string> } : undefined;
}
