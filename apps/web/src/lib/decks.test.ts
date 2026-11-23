import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { migrations } from 'virtual:migrations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '#lib/database.ts';
import {
	applyDeckChanges,
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
			expect(deck.settings).toBeNull();
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

		it('creates a deck with its settings and reads them back', async () => {
			const deck = await createDeck(database, { title: 'Talk', settings: { slideNumber: true } });
			expect(deck.settings).toEqual({ slideNumber: true });
			const stored = await getDeck(database, deck.id);
			expect(stored?.settings).toEqual({ slideNumber: true });
		});

		it('syncs every write to storage after it commits, before resolving', async () => {
			const events: string[] = [];
			const transaction = client.transaction.bind(client);
			vi.spyOn(client, 'transaction').mockImplementation(async (callback) => {
				const result = await transaction(callback);
				events.push('commit');
				return result;
			});
			const sync = client.syncToFs.bind(client);
			vi.spyOn(client, 'syncToFs').mockImplementation(async () => {
				events.push('sync');
				await sync();
			});
			const deck = await createDeck(database, { title: 'Talk', slides: ['# One', '# Two'] });
			expect(events.slice(-2)).toEqual(['commit', 'sync']);
			const id = await slideId(deck.id, 0);
			const writes = [
				() => renameDeck(database, deck.id, 'Renamed'),
				() => insertSlide(database, deck.id, 0, '# Zero'),
				() => updateSlide(database, id, '# One, edited'),
				() => duplicateSlide(database, id),
				() => moveSlide(database, id, 0),
				() => deleteSlide(database, id),
				() => deleteDeck(database, deck.id)
			];
			for (const change of writes) {
				events.length = 0;
				await change();
				expect(events.slice(-2)).toEqual(['commit', 'sync']);
			}
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

		it('finds nothing for an id that is not a uuid', async () => {
			const deck = await threeSlides();
			const id = 'not-a-uuid';
			expect(await getDeck(database, id)).toBeUndefined();
			expect(await renameDeck(database, id, 'Keynote')).toBeUndefined();
			expect(await deleteDeck(database, id)).toBeUndefined();
			expect(await insertSlide(database, id, 0, '# Lost')).toBeUndefined();
			expect(await updateSlide(database, id, '# Lost')).toBeUndefined();
			expect(await deleteSlide(database, id)).toBeUndefined();
			expect(await duplicateSlide(database, id)).toBeUndefined();
			expect(await moveSlide(database, id, 0)).toBeUndefined();
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
		});

		it('stores U+0000 in a title, scheme, aspect or markdown as U+FFFD, which Postgres text can hold', async () => {
			const deck = await createDeck(database, {
				title: 'A\0B',
				scheme: 'a\0b',
				aspect: '16:9\0',
				slides: ['# One\0']
			});
			expect(deck).toMatchObject({ title: 'A\u{FFFD}B', scheme: 'a\u{FFFD}b', aspect: '16:9\u{FFFD}' });
			expect(await markdowns(deck.id)).toEqual(['# One\u{FFFD}']);
			expect(await renameDeck(database, deck.id, '\0')).toMatchObject({ title: '\u{FFFD}' });
			expect(await insertSlide(database, deck.id, 1, '\0')).toMatchObject({ markdown: '\u{FFFD}' });
			expect(await updateSlide(database, await slideId(deck.id, 0), 'a\0b')).toMatchObject({
				markdown: 'a\u{FFFD}b'
			});
		});

		it('creates a deck with more slides than one statement can bind', async () => {
			const total = 21_846;
			const deck = await createDeck(database, {
				title: 'Long',
				slides: Array.from({ length: total }, (_, index) => `# ${index}`)
			});
			const result = await database.execute<{ total: number; last: number }>(
				sql`select count(*)::int as total, max(position) as last from slides where deck_id = ${deck.id}`
			);
			expect(result.rows).toEqual([{ total, last: total - 1 }]);
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
			const before = await ageDeck(deck);
			const first = await insertSlide(database, deck.id, 0, '# Zero');
			expect(first).toMatchObject({ deckId: deck.id, position: 0, markdown: '# Zero' });
			expect(await updatedAt(deck)).toBeGreaterThan(before);
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

		it("keeps a deck's only slide", async () => {
			const deck = await createDeck(database, { title: 'Talk', slides: ['# One', '# Two'] });
			expect(await deleteSlide(database, await slideId(deck.id, 1))).toMatchObject({ markdown: '# Two' });
			const before = await ageDeck(deck);
			expect(await deleteSlide(database, await slideId(deck.id, 0))).toBeUndefined();
			expect(await markdowns(deck.id)).toEqual(['# One']);
			expect(await updatedAt(deck)).toEqual(before);
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
			const slide = (await getDeck(database, deck.id))!.slides[from]!;
			const moved = await moveSlide(database, slide.id, to);
			expect(moved!.map(({ markdown }) => markdown)).toEqual(order);
			expect(moved!.map(({ position }) => position)).toEqual([0, 1, 2]);
			expect(moved!.find(({ id }) => id === slide.id)!.updatedAt).toEqual(slide.updatedAt);
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

		it('refuses a move to a position that is not an integer', async () => {
			const deck = await threeSlides();
			await expect(moveSlide(database, await slideId(deck.id, 0), 0.5)).rejects.toThrow(RangeError);
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
		});

		it('rolls back a move that fails after renumbering, keeping the old order', async () => {
			const deck = await threeSlides();
			await client.exec(`
				create function refuse() returns trigger language plpgsql as $$ begin raise exception 'refused'; end $$;
				create trigger refuse before update on decks for each row execute function refuse();
			`);
			await expect(moveSlide(database, await slideId(deck.id, 0), 2)).rejects.toMatchObject({
				cause: { message: 'refused' }
			});
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
		});

		it('applies a batch of changes in order, in one transaction made durable once', async () => {
			const deck = await threeSlides();
			const [one, two] = [await slideId(deck.id, 0), await slideId(deck.id, 1)];
			const [added, copied] = [crypto.randomUUID(), crypto.randomUUID()];
			const sync = vi.spyOn(client, 'syncToFs');
			await insertSlide(database, deck.id, 3, '# Lone');
			const syncsForOne = sync.mock.calls.length;
			await deleteSlide(database, await slideId(deck.id, 3));
			const before = await ageDeck(deck);
			sync.mockClear();
			const applied = await applyDeckChanges(database, deck.id, [
				{ kind: 'insert', id: added, position: 1, markdown: '# New' },
				{ kind: 'update', id: added, markdown: '# New, edited\0' },
				{ kind: 'duplicate', of: added, id: copied, markdown: '# Copy\0' },
				{ kind: 'delete', id: one },
				{ kind: 'update', id: two, markdown: '# Two, edited' },
				{ kind: 'insert', id: crypto.randomUUID(), position: 99, markdown: '# Last' },
				{ kind: 'rename', title: 'Talk, renamed' }
			]);
			expect(applied).toEqual([true, true, true, true, true, true, true]);
			expect(sync).toHaveBeenCalledTimes(syncsForOne);
			expect(await markdowns(deck.id)).toEqual([
				'# New, edited\u{FFFD}',
				'# Copy\u{FFFD}',
				'# Two, edited',
				'# Three',
				'# Last'
			]);
			expect(await positions(deck.id)).toEqual([0, 1, 2, 3, 4]);
			const stored = await getDeck(database, deck.id);
			expect(stored!.title).toBe('Talk, renamed');
			expect(stored!.slides.slice(0, 2).map(({ id }) => id)).toEqual([added, copied]);
			expect(await updatedAt(deck)).toBeGreaterThan(before);
		});

		it('rolls back the whole batch when one change fails', async () => {
			const deck = await threeSlides();
			const two = await slideId(deck.id, 1);
			const taken = await slideId(deck.id, 2);
			await expect(
				applyDeckChanges(database, deck.id, [
					{ kind: 'update', id: two, markdown: '# Two, edited' },
					{ kind: 'insert', id: crypto.randomUUID(), position: 0, markdown: '# New' },
					{ kind: 'duplicate', of: two, id: taken, markdown: '# Clash' }
				])
			).rejects.toThrow();
			expect(await markdowns(deck.id)).toEqual(['# One', '# Two', '# Three']);
			expect(await positions(deck.id)).toEqual([0, 1, 2]);
		});

		it("keeps a deck's last slide however many deletes a batch holds", async () => {
			const deck = await createDeck(database, { title: 'Talk', slides: ['# One', '# Two'] });
			const [one, two] = [await slideId(deck.id, 0), await slideId(deck.id, 1)];
			const applied = await applyDeckChanges(database, deck.id, [
				{ kind: 'delete', id: two },
				{ kind: 'delete', id: one },
				{ kind: 'update', id: one, markdown: '# One, edited' }
			]);
			expect(applied).toEqual([true, false, true]);
			expect(await markdowns(deck.id)).toEqual(['# One, edited']);
			expect(await positions(deck.id)).toEqual([0]);
		});

		it("replaces a deck's only slide when a batch adds one before deleting it, and not the other way round", async () => {
			const deck = await createDeck(database, { title: 'Talk', slides: ['# One'] });
			const one = await slideId(deck.id, 0);
			const applied = await applyDeckChanges(database, deck.id, [
				{ kind: 'delete', id: one },
				{ kind: 'insert', id: crypto.randomUUID(), position: 0, markdown: '# Skipped' }
			]);
			expect(applied).toEqual([false, false]);
			expect(await markdowns(deck.id)).toEqual(['# One']);
			const added = crypto.randomUUID();
			expect(
				await applyDeckChanges(database, deck.id, [
					{ kind: 'insert', id: added, position: 1, markdown: '# New' },
					{ kind: 'delete', id: one }
				])
			).toEqual([true, true]);
			expect(await markdowns(deck.id)).toEqual(['# New']);
			expect(await positions(deck.id)).toEqual([0]);
		});

		it('skips the inserts, copies and deletes after a change that finds its slide gone, but not the edits', async () => {
			const deck = await threeSlides();
			const [one, three] = [await slideId(deck.id, 0), await slideId(deck.id, 2)];
			const applied = await applyDeckChanges(database, deck.id, [
				{ kind: 'insert', id: crypto.randomUUID(), position: 1, markdown: '# New' },
				{ kind: 'duplicate', of: missing, id: crypto.randomUUID(), markdown: '# Copy' },
				{ kind: 'insert', id: crypto.randomUUID(), position: 2, markdown: '# Stale' },
				{ kind: 'delete', id: three },
				{ kind: 'update', id: missing, markdown: '# Lost' },
				{ kind: 'update', id: one, markdown: '# One, edited' }
			]);
			expect(applied).toEqual([true, false, false, false, false, true]);
			expect(await markdowns(deck.id)).toEqual(['# One, edited', '# New', '# Two', '# Three']);
		});

		it('applies nothing to a deck that does not exist, or to slides of another deck', async () => {
			const deck = await threeSlides();
			const other = await threeSlides();
			const two = await slideId(other.id, 1);
			expect(
				await applyDeckChanges(database, missing, [
					{ kind: 'insert', id: crypto.randomUUID(), position: 0, markdown: '#' }
				])
			).toEqual([false]);
			expect(
				await applyDeckChanges(database, deck.id, [
					{ kind: 'update', id: two, markdown: '# Not yours' },
					{ kind: 'delete', id: two },
					{ kind: 'update', id: 'not-a-slide', markdown: '# Lost' }
				])
			).toEqual([false, false, false]);
			expect(await markdowns(other.id)).toEqual(['# One', '# Two', '# Three']);
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
