/**
 * Slide text typed but not yet stored, copied to `localStorage` on every change. The database writes in a worker that
 * dies with the tab, so a write that hasn't landed when the tab closes is lost; the copy lands at once, and the next
 * time the deck opens it is saved.
 */

/** The parts of `localStorage` the journal uses. */
export type JournalStorage = {
	readonly length: number;
	key(index: number): unknown;
	getItem(key: string): unknown;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

const prefix = 'sld:journal:';

/** The `localStorage` key that holds a deck's journal. */
export function journalKey(deckId: string): string {
	return `${prefix}${deckId}`;
}

/**
 * A slide's text not yet known to be stored, and the stored texts it was typed over: the text stored when typing began,
 * and the texts since sent to be written, which may have landed.
 */
type Entry = { text: string; bases: string[] };

type Entries = Record<string, Entry>;

// The first base is the text stored when typing began, and stays while writes keep failing.
const maxBases = 4;

function isEntry(value: unknown): value is Entry {
	if (typeof value !== 'object' || value === null) return false;
	const { text, bases } = value as Record<string, unknown>;
	return typeof text === 'string' && Array.isArray(bases) && bases.every((base) => typeof base === 'string');
}

function read(storage: () => JournalStorage, deckId: string): Entries {
	let value: unknown;
	try {
		const text = storage().getItem(journalKey(deckId));
		value = typeof text === 'string' ? JSON.parse(text) : {};
	} catch {
		return {};
	}
	return typeof value !== 'object' || value === null
		? {}
		: (Object.fromEntries(Object.entries(value).filter(([, entry]) => isEntry(entry))) as Entries);
}

function write(storage: () => JournalStorage, deckId: string, entries: Entries) {
	const key = journalKey(deckId);
	try {
		if (Object.keys(entries).length === 0) {
			storage().removeItem(key);
			return;
		}
		storage().setItem(key, JSON.stringify(entries));
	} catch {
		// Without storage the app still works; only typing in a tab that closes before its write lands is lost.
	}
}

function update(storage: () => JournalStorage, deckId: string, change: (entries: Entries) => void) {
	const entries = read(storage, deckId);
	change(entries);
	write(storage, deckId, entries);
}

function withBase(bases: readonly string[], base: string): string[] {
	const unique = [...new Set([...bases, base])];
	return unique.length > maxBases ? [unique[0]!, ...unique.slice(1 - maxBases)] : unique;
}

export type SlideJournal = {
	/** Copies a change to a slide's text, typed over `stored` when nothing for the slide is in the journal yet. */
	record(slideId: string, text: string, stored: string): void;
	/** Notes that `text` is being written, so finding it stored later means no other tab wrote over it. */
	writing(slideId: string, text: string): void;
	/** Notes that `text` is stored, removing the slide's entry when nothing newer was typed. */
	stored(slideId: string, text: string): void;
	/** Removes the slide's entry, such as when the slide is gone. */
	drop(slideId: string): void;
};

/** The journal of the deck `deckId`. */
export function createSlideJournal(storage: () => JournalStorage, deckId: string): SlideJournal {
	return {
		record(slideId, text, stored) {
			update(storage, deckId, (entries) => {
				entries[slideId] = { text, bases: entries[slideId]?.bases ?? [stored] };
			});
		},
		writing(slideId, text) {
			update(storage, deckId, (entries) => {
				const entry = entries[slideId];
				if (entry) entry.bases = withBase(entry.bases, text);
			});
		},
		stored(slideId, text) {
			update(storage, deckId, (entries) => {
				const entry = entries[slideId];
				if (!entry) return;
				if (entry.text === text) delete entries[slideId];
				else entry.bases = [text];
			});
		},
		drop(slideId) {
			update(storage, deckId, (entries) => {
				delete entries[slideId];
			});
		}
	};
}

/**
 * The text to save for each slide of `slides`, as the deck `deckId` opens, from an entry whose base is still the
 * slide's stored text. An entry for a slide that is gone, or whose stored text another tab changed, is dropped, so it
 * never writes over newer text; so is one whose text is already stored.
 */
export function journaledEdits(
	storage: () => JournalStorage,
	deckId: string,
	slides: readonly { id: string; markdown: string }[]
): Map<string, string> {
	const stored = new Map(slides.map(({ id, markdown }) => [id, markdown]));
	const edits = new Map<string, string>();
	update(storage, deckId, (entries) => {
		for (const [id, { text, bases }] of Object.entries(entries)) {
			const markdown = stored.get(id);
			if (markdown !== undefined && markdown !== text && bases.includes(markdown)) edits.set(id, text);
			else delete entries[id];
		}
	});
	return edits;
}

/** Removes the journals of decks not in `deckIds`, such as deleted ones. */
export function pruneJournals(storage: () => JournalStorage, deckIds: readonly string[]): void {
	const kept = new Set(deckIds.map((id) => journalKey(id)));
	try {
		const store = storage();
		const stale: string[] = [];
		for (let index = 0; index < store.length; index++) {
			const key = store.key(index);
			if (typeof key === 'string' && key.startsWith(prefix) && !kept.has(key)) stale.push(key);
		}
		for (const key of stale) store.removeItem(key);
	} catch {
		// The journals stay until the next time the decks are listed.
	}
}
