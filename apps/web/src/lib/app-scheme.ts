import { appSchemeKey, parseStoredAppScheme, type StoredAppScheme } from '#lib/scheme-choice.ts';
import type { Scheme } from '#lib/scheme-compiler.ts';
import { schemeProperties } from '#lib/scheme-style.ts';

/** What to store for `scheme` as the app's scheme. */
export function storedAppScheme(scheme: Scheme): StoredAppScheme {
	return { slug: scheme.slug, variant: scheme.variant, properties: schemeProperties(scheme) };
}

/** The app scheme this browser stores, or undefined when there is none or storage is blocked. */
export function readAppScheme(storage: () => Storage): StoredAppScheme | undefined {
	try {
		return parseStoredAppScheme(storage().getItem(appSchemeKey));
	} catch {
		return undefined;
	}
}

/** Stores the app's scheme, or forgets it when `stored` is undefined. Blocked or full storage keeps it for this page. */
export function writeAppScheme(storage: () => Storage, stored: StoredAppScheme | undefined) {
	try {
		if (stored) storage().setItem(appSchemeKey, JSON.stringify(stored));
		else storage().removeItem(appSchemeKey);
	} catch {
		// Storage can be full or blocked; the scheme then lasts only as long as the page.
	}
}

/**
 * Sets the app scheme's properties inline on `root`, over the defaults in `scheme.css`, or clears them so the defaults,
 * which follow the system's light or dark preference, apply again.
 */
export function applyAppScheme(root: HTMLElement, stored?: StoredAppScheme) {
	const { style } = root;
	const applied = [...style].filter((property) => property.startsWith('--'));
	for (const name of applied) style.removeProperty(name);
	style.removeProperty('color-scheme');
	if (!stored) return;
	for (const [name, value] of Object.entries(stored.properties)) style.setProperty(name, value);
	style.setProperty('color-scheme', stored.variant);
}

/**
 * The stored app scheme brought up to date with the compiled schemes: their colors for its slug, or undefined when the
 * slug names no scheme any more, so the app falls back to the default.
 */
export function refreshedAppScheme(
	schemes: readonly Scheme[],
	stored: StoredAppScheme | undefined
): StoredAppScheme | undefined {
	if (!stored) return undefined;
	const scheme = schemes.find(({ slug }) => slug === stored.slug);
	return scheme && storedAppScheme(scheme);
}
