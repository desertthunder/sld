/** What a tab posts after a durable write to a deck, so the other tabs with the deck open can show it. */
export type DeckSignal = { tab: string; deckId: string };

const channelName = 'sld:deck-changes';

// A tab hears its own writes from the code that made them, so it skips the signals it posted.
const thisTab: string = crypto.randomUUID();

function isSignal(value: unknown): value is DeckSignal {
	if (typeof value !== 'object' || value === null) return false;
	const { tab, deckId } = value as Record<string, unknown>;
	return typeof tab === 'string' && typeof deckId === 'string';
}

/** Tells the other tabs that a durable write changed the deck `deckId`. */
export function announceDeckChange(deckId: string, tab = thisTab): void {
	if (typeof BroadcastChannel === 'undefined') return;
	const channel = new BroadcastChannel(channelName);
	channel.postMessage({ tab, deckId } satisfies DeckSignal);
	channel.close();
}

/** Calls `onChange` whenever another tab writes to the deck `deckId`, until the returned function stops it. */
export function listenForDeckChanges(deckId: string, onChange: () => void, tab = thisTab): () => void {
	if (typeof BroadcastChannel === 'undefined') return () => {};
	const channel = new BroadcastChannel(channelName);
	channel.addEventListener('message', ({ data }: MessageEvent<unknown>) => {
		if (isSignal(data) && data.tab !== tab && data.deckId === deckId) onChange();
	});
	return () => channel.close();
}
