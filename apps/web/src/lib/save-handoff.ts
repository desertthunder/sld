import type { Database } from '#lib/database.ts';
import { createDeck, getDeck, type Deck } from '#lib/decks.ts';
import { clearHandoff, deckFromNote, pendingHandoff, type HandoffStorage } from '#lib/handoff.ts';

/**
 * Saves the note the landing page handed over in `storage` as a new deck, durably, then removes it from `storage`, and
 * returns the deck, or `undefined` when no note is waiting. The deck takes the handoff's id, so a reload or a second
 * tab with the same session that saves it again finds the deck instead of making another. When the write fails the
 * note stays in `storage`, so a reload tries again.
 */
export async function saveHandoff(database: Database, storage: HandoffStorage): Promise<Deck | undefined> {
	const handoff = pendingHandoff(storage);
	if (!handoff) return undefined;
	let deck: Deck | undefined = await getDeck(database, handoff.id);
	if (!deck) {
		try {
			deck = await createDeck(database, { id: handoff.id, ...deckFromNote(handoff.markdown) });
		} catch (error) {
			deck = await getDeck(database, handoff.id);
			if (!deck) throw error;
		}
	}
	clearHandoff(storage, handoff.id);
	return deck;
}
