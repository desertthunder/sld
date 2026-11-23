import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '#lib/database.ts';
import * as decks from '#lib/decks.ts';
import { handOff, handoffKey } from '#lib/handoff.ts';
import { saveHandoff } from '#lib/save-handoff.ts';
import { resetTestDatabase } from '#lib/test-database.ts';

const id = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b';
const note = '# Field notes on sleep\n\nWhat I learned.\n\n---\n\n## The pattern\n\n- Late coffee\n';

function memoryStorage() {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key: string) => items.get(key),
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key)
	};
}

describe('saveHandoff', { timeout: 30_000 }, () => {
	const client = new PGlite();
	const database = createDatabase(client);

	beforeEach(async () => {
		await resetTestDatabase(client);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await client.close();
	});

	async function savedDecks() {
		const all = await decks.listDecks(database);
		return Promise.all(
			all.map(async ({ id }) => {
				const deck = await decks.getDeck(database, id);
				return { id, title: deck!.title, slides: deck!.slides.map(({ markdown }) => markdown) };
			})
		);
	}

	it('saves the note as a new deck with its slides, then forgets it', async () => {
		const storage = memoryStorage();
		handOff(storage, note, id);
		const deck = await saveHandoff(database, storage);
		expect(deck?.id).toBe(id);
		expect(await savedDecks()).toEqual([
			{
				id,
				title: 'Field notes on sleep',
				slides: ['# Field notes on sleep\n\nWhat I learned.', '## The pattern\n\n- Late coffee']
			}
		]);
		expect(storage.items.has(handoffKey)).toBe(false);
	});

	it('does nothing when no note is waiting', async () => {
		await expect(saveHandoff(database, memoryStorage())).resolves.toBeUndefined();
		expect(await savedDecks()).toEqual([]);
	});

	it('makes one deck when the same note is saved twice, as after a reload before it was forgotten', async () => {
		const storage = memoryStorage();
		handOff(storage, note, id);
		const stored = storage.items.get(handoffKey)!;
		await saveHandoff(database, storage);
		storage.items.set(handoffKey, stored);
		const again = await saveHandoff(database, storage);
		expect(again?.id).toBe(id);
		expect(await savedDecks()).toHaveLength(1);
		expect(storage.items.has(handoffKey)).toBe(false);
	});

	it('makes one deck when two saves of the same note run at once', async () => {
		const first = memoryStorage();
		handOff(first, note, id);
		const second = memoryStorage();
		second.items.set(handoffKey, first.items.get(handoffKey)!);
		await Promise.all([saveHandoff(database, first), saveHandoff(database, second)]);
		expect(await savedDecks()).toHaveLength(1);
		expect(first.items.has(handoffKey)).toBe(false);
		expect(second.items.has(handoffKey)).toBe(false);
	});

	it('saves a note whose frontmatter scheme holds U+0000, which Postgres text cannot', async () => {
		const storage = memoryStorage();
		handOff(storage, '+++\nscheme = "a\\u0000b"\n+++\n\n# One\n', id);
		expect(await saveHandoff(database, storage)).toMatchObject({ id, title: 'One', scheme: 'a\u{FFFD}b' });
		expect(storage.items.has(handoffKey)).toBe(false);
	});

	it('keeps the note when the write fails, so a reload can try again', async () => {
		const storage = memoryStorage();
		handOff(storage, note, id);
		vi.spyOn(decks, 'createDeck').mockRejectedValueOnce(new Error('leader changed'));
		await expect(saveHandoff(database, storage)).rejects.toThrow('leader changed');
		expect(storage.items.has(handoffKey)).toBe(true);
		expect(await savedDecks()).toEqual([]);
	});
});
