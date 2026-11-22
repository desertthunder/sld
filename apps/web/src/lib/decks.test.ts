import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { migrations } from 'virtual:migrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '#lib/database.ts';
import {
	createDeck,
	deleteDeck,
	deleteSlide,
	duplicateSlide,
	getDeck,
	insertSlide,
	listDecks,
	moveSlide,
	renameDeck,
	updateSlide,
	type Deck
} from '#lib/decks.ts';
import { migrate } from '#lib/migrate.ts';

const missing = '00000000-0000-4000-8000-000000000000';

// Each case starts PGlite and migrates it, which takes a few seconds when every suite runs at once.
describe('deck queries', { timeout: 30_000 }, () => {
	let client: PGlite;
	let database: Database;

	beforeEach(async () => {
		client = new PGlite();
		await migrate(client, migrations);
		database = createDatabase(client);
	});

	afterEach(async () => {
		await client.close();
	});

	async function markdowns(deckId: string): Promise<string[]> {
		const deck = await getDeck(database, deckId);
		return deck!.slides.map(({ markdown }) => markdown);
	}

	async function positions(deckId: string): Promise<number[]> {
		const deck = await getDeck(database, deckId);
		return deck!.slides.map(({ position }) => position);
	}

	async function slideId(deckId: string, position: number): Promise<string> {
		const deck = await getDeck(database, deckId);
		return deck!.slides[position]!.id;
	}

	/** Sets the deck's `updated_at` an hour back, so a write that touches it shows. */
	async function ageDeck(deck: Deck): Promise<number> {
		await database.execute(sql`update decks set updated_at = now() - interval '1 hour' where id = ${deck.id}`);
		return updatedAt(deck);
	}

	async function updatedAt(deck: Deck): Promise<number> {
		const stored = await getDeck(database, deck.id);
		return stored!.updatedAt.getTime();
	}

	async function titles(): Promise<string[]> {
		const listed = await listDecks(database);
		return listed.map(({ title }) => title);
	}

	function threeSlides(): Promise<Deck> {
		return createDeck(database, { title: 'Talk', slides: ['# One', '# Two', '# Three'] });
	}

	describe('decks', () => {
		it('creates a deck with the default aspect and no scheme', async () => {
			const deck = await createDeck(database, { title: 'Talk' });
			expect(deck).toMatchObject({ title: 'Talk', aspect: '16:9' });
			expect(deck.scheme).toBeNull();
			expect(deck.id).toMatch(/^[\da-f-]{36}$/);
			expect(deck.createdAt).toBeInstanceOf(Date);
			expect(await getDeck(database, deck.id)).toEqual({ ...deck, slides: [] });
		});

		it('creates a deck with its scheme, aspect and slides in order', async () => {
			const deck = await createDeck(database, {
				title: 'Talk',
				scheme: 'oxocarbon-dark',
				aspect: '4:3',
				slides: ['# One', '# Two']
			});
			expect(deck).toMatchObject({ scheme: 'oxocarbon-dark', aspect: '4:3' });
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two']);
			expect(await positions(deck.id)).toEqual([0, 1]);
		});

		it('syncs a write to storage before resolving', async () => {
			const sync = vi.spyOn(client, 'syncToFs');
			const deck = await createDeck(database, { title: 'Talk' });
			expect(sync).toHaveBeenCalled();
			sync.mockClear();
			await renameDeck(database, deck.id, 'Renamed');
			expect(sync).toHaveBeenCalled();
			sync.mockClear();
			await updateSlide(database, missing, '');
			expect(sync).toHaveBeenCalled();
		});

		it('lists decks, the most recently changed first', async () => {
			const first = await createDeck(database, { title: 'First' });
			const second = await createDeck(database, { title: 'Second' });
			await ageDeck(second);
			expect(await titles()).toEqual(['First', 'Second']);
			await ageDeck(first);
			await renameDeck(database, second.id, 'Second, renamed');
			expect(await titles()).toEqual(['Second, renamed', 'First']);
		});

		it('gets nothing for a deck that does not exist', async () => {
			expect(await getDeck(database, missing)).toBeUndefined();
		});

		it('renames a deck and updates when it changed', async () => {
			const deck = await createDeck(database, { title: 'Talk' });
			const before = await ageDeck(deck);
			const renamed = await renameDeck(database, deck.id, 'Keynote');
			expect(renamed).toMatchObject({ id: deck.id, title: 'Keynote' });
			expect(renamed!.updatedAt.getTime()).toBeGreaterThan(before);
			expect(await renameDeck(database, missing, 'Keynote')).toBeUndefined();
		});

		it('deletes a deck and its slides, leaving other decks alone', async () => {
			const deck = await threeSlides();
			const other = await createDeck(database, { title: 'Other', slides: ['# Kept'] });
			expect(await deleteDeck(database, deck.id)).toMatchObject({ id: deck.id, title: 'Talk' });
			expect(await getDeck(database, deck.id)).toBeUndefined();
			const remaining = await database.execute<{ markdown: string }>(sql`select markdown from slides`);
			expect(remaining.rows).toEqual([{ markdown: '# Kept' }]);
			expect(await markdowns(other.id)).toEqual(['# Kept']);
			expect(await deleteDeck(database, deck.id)).toBeUndefined();
		});
	});

	describe('slides', () => {
		it('inserts a slide at the start, in the middle and past the end', async () => {
			const deck = await threeSlides();
			const first = await insertSlide(database, deck.id, 0, '# Zero');
			expect(first).toMatchObject({ deckId: deck.id, position: 0, markdown: '# Zero' });
			await insertSlide(database, deck.id, 2, '# One and a half');
			await insertSlide(database, deck.id, 99, '# Last');
			expect(await markdowns(deck.id)).toEqual([
				'# Zero',
				'# One',
				'# One and a half',
				'# Two',
				'# Three',
				'# Last'
			]);
			expect(await positions(deck.id)).toEqual([0, 1, 2, 3, 4, 5]);
		});

		it('inserts the first slide of an empty deck', async () => {
			const deck = await createDeck(database, { title: 'Talk' });
			await insertSlide(database, deck.id, 3, '# Only');
			expect(await positions(deck.id)).toEqual([0]);
		});

		it('inserts nothing into a deck that does not exist, and refuses a position that is not an integer', async () => {
			expect(await insertSlide(database, missing, 0, '# Lost')).toBeUndefined();
			const deck = await threeSlides();
			await expect(insertSlide(database, deck.id, 1.5, '# Half')).rejects.toThrow(RangeError);
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
		});

		it("updates a slide's markdown and when the slide and its deck changed", async () => {
			const deck = await threeSlides();
			const id = await slideId(deck.id, 1);
			const before = await ageDeck(deck);
			const slide = await updateSlide(database, id, '# Two, edited');
			expect(slide).toMatchObject({ id, position: 1, markdown: '# Two, edited' });
			expect(slide!.updatedAt.getTime()).toBeGreaterThan(slide!.createdAt.getTime());
			expect(await updatedAt(deck)).toBeGreaterThan(before);
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two, edited', '# Three']);
			expect(await updateSlide(database, missing, '# Lost')).toBeUndefined();
		});

		it('deletes a slide and closes the gap it leaves', async () => {
			const deck = await threeSlides();
			const before = await ageDeck(deck);
			expect(await deleteSlide(database, await slideId(deck.id, 0))).toMatchObject({ markdown: '# One' });
			expect(await markdowns(deck.id)).toEqual(['# Two', '# Three']);
			expect(await positions(deck.id)).toEqual([0, 1]);
			expect(await updatedAt(deck)).toBeGreaterThan(before);
			expect(await deleteSlide(database, missing)).toBeUndefined();
		});

		it('duplicates a slide to the place right after it', async () => {
			const deck = await threeSlides();
			const id = await slideId(deck.id, 1);
			const before = await ageDeck(deck);
			const copy = await duplicateSlide(database, id);
			expect(copy).toMatchObject({ deckId: deck.id, position: 2, markdown: '# Two' });
			expect(copy!.id).not.toBe(id);
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Two', '# Three']);
			expect(await positions(deck.id)).toEqual([0, 1, 2, 3]);
			expect(await updatedAt(deck)).toBeGreaterThan(before);
			await duplicateSlide(database, await slideId(deck.id, 3));
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Two', '# Three', '# Three']);
			expect(await duplicateSlide(database, missing)).toBeUndefined();
		});

		it.for([
			{ name: 'the last slide to the first position', from: 2, to: 0, order: ['# Three', '# One', '# Two'] },
			{ name: 'the first slide to the last position', from: 0, to: 2, order: ['# Two', '# Three', '# One'] },
			{ name: 'a slide one place earlier', from: 1, to: 0, order: ['# Two', '# One', '# Three'] },
			{ name: 'a slide one place later', from: 1, to: 2, order: ['# One', '# Three', '# Two'] },
			{ name: 'a slide past the end to the last position', from: 0, to: 9, order: ['# Two', '# Three', '# One'] },
			{
				name: 'a slide before the start to the first position',
				from: 2,
				to: -1,
				order: ['# Three', '# One', '# Two']
			}
		])('moves $name', async ({ from, to, order }) => {
			const deck = await threeSlides();
			const before = await ageDeck(deck);
			const moved = await moveSlide(database, await slideId(deck.id, from), to);
			expect(moved!.map(({ markdown }) => markdown)).toEqual(order);
			expect(moved!.map(({ position }) => position)).toEqual([0, 1, 2]);
			expect(await markdowns(deck.id)).toEqual(order);
			expect(await updatedAt(deck)).toBeGreaterThan(before);
		});

		it('leaves the order and the deck alone when a slide moves to where it is', async () => {
			const deck = await threeSlides();
			const before = await ageDeck(deck);
			const moved = await moveSlide(database, await slideId(deck.id, 1), 1);
			expect(moved!.map(({ markdown }) => markdown)).toEqual(['# One', '# Two', '# Three']);
			expect(await updatedAt(deck)).toEqual(before);
		});

		it('moves a slide without touching the slides of other decks', async () => {
			const deck = await threeSlides();
			const other = await threeSlides();
			await moveSlide(database, await slideId(deck.id, 0), 2);
			expect(await markdowns(other.id)).toEqual(['# One', '# Two', '# Three']);
			expect(await moveSlide(database, missing, 0)).toBeUndefined();
		});

		it('rolls back a move that fails, keeping the old order', async () => {
			const deck = await threeSlides();
			await expect(moveSlide(database, await slideId(deck.id, 0), 0.5)).rejects.toThrow(RangeError);
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
		});

		it('refuses two slides at one position once a statement ends, though it may pass through one', async () => {
			const deck = await threeSlides();
			await expect(
				database.execute(sql`update slides set position = 0 where deck_id = ${deck.id} and position = 1`)
			).rejects.toMatchObject({ cause: { message: expect.stringMatching(/slides_deck_id_position_unique/) } });
			await database.execute(sql`update slides set position = 2 - position where deck_id = ${deck.id}`);
			expect(await markdowns(deck.id)).toEqual(['# Three', '# Two', '# One']);
		});
	});
});
