/** What a write changed in a deck. */
export type DeckChangeKind = 'created' | 'deleted' | 'title' | 'scheme' | 'slides' | 'text';

/** What a tab posts after a durable write to a deck, so the other tabs with the deck open can show it. */
export type DeckSignal = { tab: string; deckId: string; changed: DeckChangeKind[] };

const channelName = 'sld:deck-changes';

// A tab hears its own writes from the code that made them, so it skips the signals it posted.
const thisTab: string = crypto.randomUUID();

const kinds: ReadonlySet<string> = new Set<DeckChangeKind>(['created', 'deleted', 'title', 'scheme', 'slides', 'text']);

function isSignal(value: unknown): value is DeckSignal {
	if (typeof value !== 'object' || value === null) return false;
	const { tab, deckId, changed } = value as Record<string, unknown>;
	return (
		typeof tab === 'string' &&
		typeof deckId === 'string' &&
		Array.isArray(changed) &&
		changed.every((kind) => typeof kind === 'string' && kinds.has(kind))
	);
}

/** Tells the other tabs that a durable write changed the deck `deckId`. */
export function announceDeckChange(deckId: string, changed: readonly DeckChangeKind[], tab = thisTab): void {
	if (typeof BroadcastChannel === 'undefined' || changed.length === 0) return;
	const channel = new BroadcastChannel(channelName);
	channel.postMessage({ tab, deckId, changed: [...new Set(changed)] } satisfies DeckSignal);
	channel.close();
}

/**
 * Calls `onChange` with what changed whenever another tab writes to the deck `deckId`, until the returned function
 * stops it.
 */
export function listenForDeckChanges(
	deckId: string,
	onChange: (changed: DeckChangeKind[]) => void,
	tab = thisTab
): () => void {
	if (typeof BroadcastChannel === 'undefined') return () => {};
	const channel = new BroadcastChannel(channelName);
	channel.addEventListener('message', ({ data }: MessageEvent<unknown>) => {
		if (isSignal(data) && data.tab !== tab && data.deckId === deckId) onChange(data.changed);
	});
	return () => channel.close();
}
