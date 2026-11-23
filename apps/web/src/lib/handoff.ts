import { splitDeck } from '#lib/deck-markdown.ts';
import { settingsFromFrontmatter } from '#lib/deck-settings.ts';
import { deckTitle } from '#lib/deck-title.ts';
import type { NewDeck } from '#lib/decks.ts';
import { isUuid } from '#lib/uuid.ts';

/**
 * A note the landing page hands to `/app` to save as a deck. The id, chosen when the note is handed over, becomes the
 * deck's id, so saving it twice can't make two decks.
 */
export type Handoff = { id: string; markdown: string };

/** The `sessionStorage` key that holds the handed-over note until `/app` has saved it. */
export const handoffKey = 'sld:handoff';

/** The parts of `sessionStorage` a handoff uses. */
export type HandoffStorage = {
	getItem(key: string): unknown;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

/**
 * Stores `markdown` for `/app` to save as a new deck, and returns what it stored. When storing fails, it also removes
 * any older note still waiting, so `/app` never saves a note other than the one handed over last.
 */
export function handOff(storage: HandoffStorage, markdown: string, id: string = crypto.randomUUID()): Handoff {
	const handoff = { id, markdown };
	try {
		storage.setItem(handoffKey, JSON.stringify(handoff));
	} catch (error) {
		storage.removeItem(handoffKey);
		throw error;
	}
	return handoff;
}

/** The note waiting in `storage` to be saved, or `undefined` when there is none or it can't be read. */
export function pendingHandoff(storage: HandoffStorage): Handoff | undefined {
	const text = storage.getItem(handoffKey);
	if (typeof text !== 'string') return undefined;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof value !== 'object' || value === null) return undefined;
	const { id, markdown } = value as Record<string, unknown>;
	return typeof id === 'string' && typeof markdown === 'string' && isUuid(id) ? { id, markdown } : undefined;
}

/** Removes the note `storage` holds once the deck `id` is saved, unless a newer note has replaced it since. */
export function clearHandoff(storage: HandoffStorage, id: string): void {
	const pending = pendingHandoff(storage);
	if (pending === undefined || pending.id === id) storage.removeItem(handoffKey);
}

const aspects = new Set(['16:9', '4:3']);

/**
 * The deck a note makes on the day it is `made`: its slides as `splitDeck` splits them, its scheme, aspect and settings
 * from its frontmatter, and its title as `deckTitle` gives it.
 */
export function deckFromNote(markdown: string, made: Date = new Date()): Omit<NewDeck, 'id'> & { slides: string[] } {
	const split = splitDeck(markdown);
	const { frontmatter, slides } = split;
	const settings = settingsFromFrontmatter(frontmatter?.data);
	return {
		title: deckTitle(split, made),
		...(frontmatter?.scheme && { scheme: frontmatter.scheme }),
		...(frontmatter?.aspect && aspects.has(frontmatter.aspect) && { aspect: frontmatter.aspect }),
		...(settings && { settings }),
		slides
	};
}
