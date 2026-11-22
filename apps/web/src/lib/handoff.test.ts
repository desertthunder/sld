import { describe, expect, it } from 'vitest';
import { clearHandoff, deckFromNote, handOff, handoffKey, pendingHandoff } from '#lib/handoff.ts';

const id = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b';
const other = '6f9619ff-8b86-4011-b42d-00c04fc964ff';

function memoryStorage(entries: Record<string, string> = {}) {
	const items = new Map(Object.entries(entries));
	return {
		items,
		getItem: (key: string) => items.get(key),
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key)
	};
}

describe('handOff and pendingHandoff', () => {
	it('stores a note that reads back with its id', () => {
		const storage = memoryStorage();
		expect(handOff(storage, '# One\n\n---\n\n# Two', id)).toEqual({ id, markdown: '# One\n\n---\n\n# Two' });
		expect(pendingHandoff(storage)).toEqual({ id, markdown: '# One\n\n---\n\n# Two' });
	});

	it('gives each note a new uuid when no id is given', () => {
		const storage = memoryStorage();
		const first = handOff(storage, 'a');
		const second = handOff(storage, 'a');
		expect(first.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
		expect(second.id).not.toBe(first.id);
		expect(pendingHandoff(storage)).toEqual(second);
	});

	it('finds nothing when no note is stored', () => {
		expect(pendingHandoff(memoryStorage())).toBeUndefined();
	});

	it.each([
		['text that is not JSON', 'not json'],
		['JSON that is not an object', '"text"'],
		['a missing id', JSON.stringify({ markdown: 'a' })],
		['an id that is not a uuid', JSON.stringify({ id: 'deck', markdown: 'a' })],
		['markdown that is not text', JSON.stringify({ id, markdown: 3 })]
	])('ignores %s', (_case, text) => {
		expect(pendingHandoff(memoryStorage({ [handoffKey]: text }))).toBeUndefined();
	});
});

describe('clearHandoff', () => {
	it('removes the note once its deck is saved', () => {
		const storage = memoryStorage();
		handOff(storage, 'a', id);
		clearHandoff(storage, id);
		expect(storage.items.has(handoffKey)).toBe(false);
	});

	it('keeps a newer note that replaced the saved one', () => {
		const storage = memoryStorage();
		handOff(storage, 'b', other);
		clearHandoff(storage, id);
		expect(pendingHandoff(storage)).toEqual({ id: other, markdown: 'b' });
	});
});

describe('deckFromNote', () => {
	it('splits the note into slides as splitDeck does and takes the first heading as the title', () => {
		expect(deckFromNote('# Field notes on sleep\n\nWhat I learned.\n\n---\n\n## The pattern\n')).toEqual({
			title: 'Field notes on sleep',
			slides: ['# Field notes on sleep\n\nWhat I learned.', '## The pattern']
		});
	});

	it('takes the title, scheme and aspect from the frontmatter', () => {
		expect(deckFromNote('+++\ntitle = "Talk"\nscheme = "gruvbox-dark"\naspect = "4:3"\n+++\n\n# One\n')).toEqual({
			title: 'Talk',
			scheme: 'gruvbox-dark',
			aspect: '4:3',
			slides: ['# One']
		});
	});

	it('leaves out an aspect the stage has no size for', () => {
		expect(deckFromNote('---\naspect: 21:9\n---\n\n# One\n')).toEqual({ title: 'One', slides: ['# One'] });
	});

	it.each([
		['a closed heading', '## Closed heading ##', 'Closed heading'],
		['a list item', '- First item\n- Second item', 'First item'],
		['a quote', '> Quoted line', 'Quoted line'],
		['a setext heading', 'Plain title\n===', 'Plain title']
	])('takes the text of %s as the title', (_case, markdown, title) => {
		expect(deckFromNote(markdown).title).toBe(title);
	});

	it("skips a slide's frontmatter and slides with no text when it looks for a title", () => {
		expect(deckFromNote('---\n\n+++\nlayout = "title"\n+++\n\n---\n\n## Second\n').title).toBe('Second');
	});

	it('gives an empty note no slides and no title', () => {
		expect(deckFromNote('\n\n')).toEqual({ title: '', slides: [] });
	});
});
