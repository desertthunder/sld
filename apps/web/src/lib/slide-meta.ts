import type { Frontmatter, FrontmatterError } from '#lib/deck-markdown.ts';

/** The layouts a slide can name in its frontmatter's `layout` field. */
export const layouts = ['default', 'title', 'center', 'section'] as const;

/** A slide layout, as `layouts` lists them. */
export type Layout = (typeof layouts)[number];

/**
 * What a slide's frontmatter sets, validated.
 *
 * - `layout` puts one class on the slide element: `layout-default`, `layout-title`, `layout-center` or
 *   `layout-section`.
 * - `notes` are the speaker's notes, which only the speaker view shows.
 * - `classes` are the extra class names from `class`, valid class tokens only, and never `slide`, a `layout-` or
 *   `svelte-` name, or one of the stage's own classes.
 * - `scheme` is the slug of the scheme the slide takes in place of the deck's, lowercased. A slug that names no scheme
 *   leaves the slide on the deck's.
 *
 * Keys sld doesn't read, and keys left empty or holding only spaces, stay out of it, with no warning.
 */
export type SlideMeta = { layout: Layout; notes: string | undefined; classes: string[]; scheme: string | undefined };

/**
 * Something in a slide's frontmatter that sld set aside. The slide still shows, with the field's default.
 *
 * - `invalid-frontmatter`: the block is shaped as frontmatter but doesn't parse, so it shows as slide text.
 * - `unknown-layout`: `layout` isn't one of `layouts`, so the slide uses `default`.
 * - `invalid-notes`: `notes` isn't a string, so the slide has none.
 * - `invalid-class`: `class` isn't a string or a list of strings, or `value` isn't a valid class token.
 * - `reserved-class`: `value` would clash with the slide's own classes.
 * - `invalid-scheme`: `scheme` isn't a string, so the slide uses the deck's.
 */
export type SlideWarning =
	| ({ kind: 'invalid-frontmatter' } & FrontmatterError)
	| { kind: 'unknown-layout'; value: unknown }
	| { kind: 'invalid-notes'; value: unknown }
	| { kind: 'invalid-class'; value: unknown }
	| { kind: 'reserved-class'; value: string }
	| { kind: 'invalid-scheme'; value: unknown };

/** A slide's validated meta and the warnings reading it raised. */
export type ReadSlideMeta = { meta: SlideMeta; warnings: SlideWarning[] };

const classToken = /^-?[A-Za-z_][\w-]*$/;
const reservedClasses = new Set(['slide', 'frame', 'stage', 'content']);
const reservedPrefixes = ['layout-', 'svelte-'];

/** The class `layout` puts on the slide element. */
export function layoutClass(layout: Layout): string {
	return `layout-${layout}`;
}

/** Every class on a slide element: `slide`, its layout class, then its extra classes. */
export function slideClasses(meta: SlideMeta): string[] {
	return ['slide', layoutClass(meta.layout), ...meta.classes];
}

/** Reads a slide's meta from its frontmatter, falling back to each field's default when a value isn't usable. */
export function readSlideMeta(frontmatter: Frontmatter | undefined): ReadSlideMeta {
	const data = frontmatter?.data ?? {};
	// YAML reads a key with no value as null, which leaves the field unset, as a blank string does.
	const field = (key: string): unknown => {
		const value = data[key];
		return value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;
	};
	const warnings: SlideWarning[] = [];
	return {
		meta: {
			layout: readLayout(field('layout'), warnings),
			notes: readNotes(field('notes'), warnings),
			classes: readClasses(field('class'), warnings),
			scheme: readScheme(field('scheme'), warnings)
		},
		warnings
	};
}

function readLayout(value: unknown, warnings: SlideWarning[]): Layout {
	if (value === undefined) return 'default';
	const name = typeof value === 'string' ? value.trim().toLowerCase() : undefined;
	const layout = layouts.find((known) => known === name);
	if (layout === undefined) warnings.push({ kind: 'unknown-layout', value });
	return layout ?? 'default';
}

function readScheme(value: unknown, warnings: SlideWarning[]): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === 'string') return value.trim().toLowerCase();
	warnings.push({ kind: 'invalid-scheme', value });
	return undefined;
}

function readNotes(value: unknown, warnings: SlideWarning[]): string | undefined {
	if (value === undefined || typeof value === 'string') return value;
	warnings.push({ kind: 'invalid-notes', value });
	return undefined;
}

function readClasses(value: unknown, warnings: SlideWarning[]): string[] {
	if (value === undefined) return [];
	if (typeof value !== 'string' && !Array.isArray(value)) {
		warnings.push({ kind: 'invalid-class', value });
		return [];
	}
	const tokens = (Array.isArray(value) ? value : [value]).flatMap((item: unknown) =>
		typeof item === 'string' ? item.split(/\s+/).filter((token) => token !== '') : [item]
	);
	const classes = new Set<string>();
	for (const token of tokens) {
		if (typeof token !== 'string' || !classToken.test(token))
			warnings.push({ kind: 'invalid-class', value: token });
		else if (isReserved(token)) warnings.push({ kind: 'reserved-class', value: token });
		else classes.add(token);
	}
	return [...classes];
}

function isReserved(token: string): boolean {
	const name = token.toLowerCase();
	return reservedClasses.has(name) || reservedPrefixes.some((prefix) => name.startsWith(prefix));
}
