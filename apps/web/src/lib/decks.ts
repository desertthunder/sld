import { and, asc, count, desc, eq, gt, gte, sql } from 'drizzle-orm';
import { writeDurably, type Database } from '#lib/database.ts';
import { decks, slides } from '#lib/schema.ts';
import { isUuid } from '#lib/uuid.ts';

export type Deck = typeof decks.$inferSelect;
export type Slide = typeof slides.$inferSelect;

/** A deck with its slides in order. */
export type DeckWithSlides = Deck & { slides: Slide[] };

/**
 * What a new deck needs: its title, and optionally its id, scheme, aspect and the markdown of its slides in order. Give
 * an id to make the write safe to repeat: a second deck with the same id fails to insert.
 */
export type NewDeck = {
	id?: string;
	title: string;
	scheme?: string | null;
	aspect?: string;
	slides?: readonly string[];
};

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Every write below goes through `writeDurably`, so a write that resolves is in IndexedDB.
function write<T>(database: Database, change: (tx: Transaction) => Promise<T>): Promise<T> {
	return writeDurably(database, (database) => database.transaction(change));
}

function touchDeck(tx: Transaction, deckId: string) {
	return tx
		.update(decks)
		.set({ updatedAt: sql`now()` })
		.where(eq(decks.id, deckId));
}

async function slideCount(tx: Transaction, deckId: string): Promise<number> {
	const [row] = await tx.select({ total: count() }).from(slides).where(eq(slides.deckId, deckId));
	return row?.total ?? 0;
}

// Postgres text cannot hold U+0000. CommonMark replaces it with U+FFFD, so markdown means the same either way.
function storable(text: string): string {
	return text.replaceAll('\0', '\u{FFFD}');
}

// Postgres binds at most 65,535 parameters to one statement, and each slide row takes three.
const slidesPerInsert = 1000;

function clampPosition(position: number, last: number): number {
	if (!Number.isSafeInteger(position)) throw new RangeError(`A slide position must be an integer, not ${position}`);
	return Math.min(Math.max(position, 0), last);
}

/** Creates a deck, with its slides when `slides` lists their markdown, and returns it. */
export function createDeck(
	database: Database,
	{ slides: markdowns = [], title, scheme, aspect, ...fields }: NewDeck
): Promise<Deck> {
	return write(database, async (tx) => {
		const [deck] = await tx
			.insert(decks)
			.values({
				...fields,
				title: storable(title),
				scheme: scheme && storable(scheme),
				aspect: aspect && storable(aspect)
			})
			.returning();
		const rows = markdowns.map((markdown, position) => ({
			deckId: deck!.id,
			position,
			markdown: storable(markdown)
		}));
		for (let start = 0; start < rows.length; start += slidesPerInsert) {
			await tx.insert(slides).values(rows.slice(start, start + slidesPerInsert));
		}
		return deck!;
	});
}

/** Lists every deck, the most recently changed first. */
export function listDecks(database: Database): Promise<Deck[]> {
	return database.select().from(decks).orderBy(desc(decks.updatedAt), asc(decks.title));
}

/** Gets a deck with its slides in order, or `undefined` when there is no such deck. */
export async function getDeck(database: Database, id: string): Promise<DeckWithSlides | undefined> {
	if (!isUuid(id)) return;
	return database.transaction(async (tx) => {
		const [deck] = await tx.select().from(decks).where(eq(decks.id, id));
		if (!deck) return;
		const rows = await tx.select().from(slides).where(eq(slides.deckId, id)).orderBy(asc(slides.position));
		return { ...deck, slides: rows };
	});
}

/** Renames a deck and returns it, or `undefined` when there is no such deck. */
export function renameDeck(database: Database, id: string, title: string): Promise<Deck | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx
			.update(decks)
			.set({ title: storable(title), updatedAt: sql`now()` })
			.where(eq(decks.id, id))
			.returning();
		return deck;
	});
}

/** Deletes a deck and its slides, and returns the deck, or `undefined` when there is no such deck. */
export function deleteDeck(database: Database, id: string): Promise<Deck | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx.delete(decks).where(eq(decks.id, id)).returning();
		return deck;
	});
}

/**
 * Inserts a slide into a deck at `position`, moving the slides from there on one place later, and returns it. A
 * position past the end appends the slide. Give `id` to choose the new slide's id, so it can be shown before the write
 * resolves. It returns `undefined` when there is no such deck.
 */
export function insertSlide(
	database: Database,
	deckId: string,
	position: number,
	markdown: string,
	id?: string
): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(deckId)) return;
		const touched = await touchDeck(tx, deckId).returning({ id: decks.id });
		if (touched.length === 0) return;
		const at = clampPosition(position, await slideCount(tx, deckId));
		return insertAt(tx, { id, deckId, position: at, markdown: storable(markdown) });
	});
}

async function insertAt(tx: Transaction, row: typeof slides.$inferInsert): Promise<Slide> {
	await tx
		.update(slides)
		.set({ position: sql`${slides.position} + 1` })
		.where(and(eq(slides.deckId, row.deckId), gte(slides.position, row.position)));
	const [slide] = await tx.insert(slides).values(row).returning();
	return slide!;
}

/** Replaces a slide's markdown and returns the slide, or `undefined` when there is no such slide. */
export function updateSlide(database: Database, id: string, markdown: string): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx
			.update(slides)
			.set({ markdown: storable(markdown), updatedAt: sql`now()` })
			.where(eq(slides.id, id))
			.returning();
		if (slide) await touchDeck(tx, slide.deckId);
		return slide;
	});
}

/**
 * Deletes a slide, moving the slides after it one place earlier, and returns it. It returns `undefined`, and deletes
 * nothing, when there is no such slide or the slide is its deck's only one, since a deck always keeps a slide.
 */
export function deleteSlide(database: Database, id: string): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [found] = await tx.select({ deckId: slides.deckId }).from(slides).where(eq(slides.id, id));
		if (!found || (await slideCount(tx, found.deckId)) <= 1) return;
		const [slide] = await tx.delete(slides).where(eq(slides.id, id)).returning();
		if (!slide) return;
		await tx
			.update(slides)
			.set({ position: sql`${slides.position} - 1` })
			.where(and(eq(slides.deckId, slide.deckId), gt(slides.position, slide.position)));
		await touchDeck(tx, slide.deckId);
		return slide;
	});
}

/**
 * Copies a slide to the place right after it and returns the copy, or `undefined` when there is no such slide. Give
 * `copyId` to choose the copy's id.
 */
export function duplicateSlide(database: Database, id: string, copyId?: string): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx.select().from(slides).where(eq(slides.id, id));
		if (!slide) return;
		await touchDeck(tx, slide.deckId);
		const { deckId, position, markdown } = slide;
		return insertAt(tx, { id: copyId, deckId, position: position + 1, markdown });
	});
}

/**
 * Moves a slide to `position` within its deck, shifting the slides between its old and new place by one, and returns
 * the deck's slides in their new order, or `undefined` when there is no such slide. A position past the end moves it
 * to the end.
 */
export function moveSlide(database: Database, id: string, position: number): Promise<Slide[] | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx.select().from(slides).where(eq(slides.id, id));
		if (!slide) return;
		const { deckId, position: from } = slide;
		const to = clampPosition(position, (await slideCount(tx, deckId)) - 1);
		if (to !== from) {
			const shift = to < from ? sql`${slides.position} + 1` : sql`${slides.position} - 1`;
			// One statement, so the deferrable unique constraint sees only the final positions.
			await tx
				.update(slides)
				.set({ position: sql`case when ${slides.id} = ${id} then ${to} else ${shift} end` })
				.where(
					and(
						eq(slides.deckId, deckId),
						sql`${slides.position} between ${Math.min(from, to)} and ${Math.max(from, to)}`
					)
				);
			await touchDeck(tx, deckId);
		}
		return tx.select().from(slides).where(eq(slides.deckId, deckId)).orderBy(asc(slides.position));
	});
}
