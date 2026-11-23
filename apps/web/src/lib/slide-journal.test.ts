import { describe, expect, it } from 'vitest';
import {
	createSlideJournal,
	journaledEdits,
	journalKey,
	pruneJournals,
	type JournalStorage
} from '#lib/slide-journal.ts';

function memoryStorage(): JournalStorage & { items: Map<string, string> } {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key) => items.get(key),
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key),
		key: (index) => items.keys().toArray()[index],
		get length() {
			return items.size;
		}
	};
}

const blocked = (): JournalStorage => {
	throw new DOMException('The operation is insecure.', 'SecurityError');
};

describe('the slide journal', () => {
	it('replays typing over the stored text when the deck opens, and keeps it until it is stored', () => {
		const storage = memoryStorage();
		const journal = createSlideJournal(() => storage, 'deck');
		journal.record('a', '# One!', '# One');
		journal.record('a', '# One!!', '# One!');
		expect(journaledEdits(() => storage, 'deck', [{ id: 'a', markdown: '# One' }])).toEqual(
			new Map([['a', '# One!!']])
		);
		journal.stored('a', '# One!!');
		expect(storage.items.has(journalKey('deck'))).toBe(false);
	});

	it('keeps newer typing when an older write lands, and replays it over that write', () => {
		const storage = memoryStorage();
		const journal = createSlideJournal(() => storage, 'deck');
		journal.record('a', '# One!', '# One');
		journal.writing('a', '# One!');
		journal.record('a', '# One!!', '# One!');
		expect(journaledEdits(() => storage, 'deck', [{ id: 'a', markdown: '# One!' }])).toEqual(
			new Map([['a', '# One!!']])
		);
		journal.stored('a', '# One!');
		expect(journaledEdits(() => storage, 'deck', [{ id: 'a', markdown: '# One!' }])).toEqual(
			new Map([['a', '# One!!']])
		);
	});

	it('drops typing over text another tab has since changed, and typing for a slide that is gone', () => {
		const storage = memoryStorage();
		const journal = createSlideJournal(() => storage, 'deck');
		journal.record('a', '# One!', '# One');
		journal.record('b', '# Two!', '# Two');
		journal.record('c', '# Three', '# Three');
		expect(
			journaledEdits(() => storage, 'deck', [
				{ id: 'a', markdown: '# One, elsewhere' },
				{ id: 'c', markdown: '# Three' }
			])
		).toEqual(new Map());
		expect(storage.items.has(journalKey('deck'))).toBe(false);
	});

	it('removes a slide entry when the slide is gone', () => {
		const storage = memoryStorage();
		const journal = createSlideJournal(() => storage, 'deck');
		journal.record('a', '# One!', '# One');
		journal.drop('a');
		expect(storage.items.size).toBe(0);
	});

	it('keeps the text stored when typing began among a few bases while writes keep failing', () => {
		const storage = memoryStorage();
		const journal = createSlideJournal(() => storage, 'deck');
		journal.record('a', '1', '0');
		for (const text of ['1', '2', '3', '4', '5']) journal.writing('a', text);
		const entries = JSON.parse(storage.items.get(journalKey('deck'))!) as Record<string, { bases: string[] }>;
		expect(entries.a!.bases).toEqual(['0', '3', '4', '5']);
	});

	it('ignores a journal it cannot read, and works without storage', () => {
		const storage = memoryStorage();
		storage.setItem(journalKey('deck'), '{not json');
		expect(journaledEdits(() => storage, 'deck', [{ id: 'a', markdown: '' }])).toEqual(new Map());
		const journal = createSlideJournal(blocked, 'deck');
		expect(() => {
			journal.record('a', '# One!', '# One');
			journal.writing('a', '# One!');
			journal.stored('a', '# One!');
			journal.drop('a');
		}).not.toThrow();
		expect(journaledEdits(blocked, 'deck', [{ id: 'a', markdown: '# One' }])).toEqual(new Map());
		expect(() => pruneJournals(blocked, [])).not.toThrow();
	});
});

describe('pruneJournals', () => {
	it('removes the journals of decks that are gone and leaves everything else', () => {
		const storage = memoryStorage();
		createSlideJournal(() => storage, 'kept').record('a', '# One!', '# One');
		createSlideJournal(() => storage, 'gone').record('a', '# One!', '# One');
		storage.setItem('sld:pane-widths', '{}');
		pruneJournals(() => storage, ['kept']);
		expect(storage.items.keys().toArray()).toEqual([journalKey('kept'), 'sld:pane-widths']);
	});
});
