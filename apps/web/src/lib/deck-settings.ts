/** How a deck presents. A setting left out takes its default. */
export type DeckSettings = { slideNumber?: boolean };

/** How a deck presents with every setting filled in. */
export type PresentSettings = Required<DeckSettings>;

const defaults: PresentSettings = { slideNumber: false };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a deck's stored `settings` with every setting filled in. Stored JSON comes from older builds or other tabs, so
 * a missing or malformed value, or a setting of the wrong type, takes the default.
 */
export function presentSettings(stored: unknown): PresentSettings {
	const settings = isRecord(stored) ? stored : {};
	return { slideNumber: typeof settings.slideNumber === 'boolean' ? settings.slideNumber : defaults.slideNumber };
}

/**
 * The settings a deck's frontmatter sets, to store when the deck is imported, or undefined when it sets none. A field
 * of the wrong type, such as `slideNumber: "yes"`, sets nothing.
 */
export function settingsFromFrontmatter(data: Record<string, unknown> | undefined): DeckSettings | undefined {
	return typeof data?.slideNumber === 'boolean' ? { slideNumber: data.slideNumber } : undefined;
}

/**
 * The frontmatter fields for a deck's stored `settings`, the reverse of `settingsFromFrontmatter`: only the settings
 * sld knows, and only those stored with the right type, so an export never writes a setting import would drop.
 */
export function settingsFrontmatter(stored: unknown): DeckSettings {
	return isRecord(stored) && typeof stored.slideNumber === 'boolean' ? { slideNumber: stored.slideNumber } : {};
}
