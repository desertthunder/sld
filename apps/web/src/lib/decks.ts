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
 * position past the end appends the slide. It returns `undefined` when there is no such deck.
 */
export function insertSlide(
	database: Database,
	deckId: string,
	position: number,
	markdown: string
): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(deckId)) return;
		const touched = await touchDeck(tx, deckId).returning({ id: decks.id });
		if (touched.length === 0) return;
		const at = clampPosition(position, await slideCount(tx, deckId));
		return insertAt(tx, deckId, at, storable(markdown));
	});
}

async function insertAt(tx: Transaction, deckId: string, position: number, markdown: string): Promise<Slide> {
	await tx
		.update(slides)
		.set({ position: sql`${slides.position} + 1` })
		.where(and(eq(slides.deckId, deckId), gte(slides.position, position)));
	const [slide] = await tx.insert(slides).values({ deckId, position, markdown }).returning();
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

/** Copies a slide to the place right after it and returns the copy, or `undefined` when there is no such slide. */
export function duplicateSlide(database: Database, id: string): Promise<Slide | undefined> {
	return write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx.select().from(slides).where(eq(slides.id, id));
		if (!slide) return;
		await touchDeck(tx, slide.deckId);
		return insertAt(tx, slide.deckId, slide.position + 1, slide.markdown);
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

/**
 * One change to a deck, as `applyDeckChanges` takes it: an edit to a slide's markdown, a new slide at a position, a
 * copy of a slide right after it, a slide to delete, or a new title.
 */
export type DeckChange =
	| { kind: 'update'; id: string; markdown: string }
	| { kind: 'insert'; id: string; position: number; markdown: string }
	| { kind: 'duplicate'; of: string; id: string; markdown: string }
	| { kind: 'delete'; id: string }
	| { kind: 'rename'; title: string };

// A slide as a batch leaves it: whether the batch inserts it, and its markdown when the batch sets that.
type BatchSlide = { id: string; isNew: boolean; markdown?: string };

/**
 * Applies `changes` to a deck in order, in one transaction made durable once, and resolves to whether each one applied.
 * A change doesn't apply when its slide is gone, when it would delete the deck's last slide, or when the deck is gone,
 * which applies none. After a change that doesn't apply, the inserts, copies and deletes are skipped too, since they
 * were asked for on a list that no longer matches; edits and renames still apply. A failure rolls back every change.
 */
export function applyDeckChanges(
	database: Database,
	deckId: string,
	changes: readonly DeckChange[]
): Promise<boolean[]> {
	return write(database, async (tx) => {
		const applied: boolean[] = changes.map(() => false);
		if (!isUuid(deckId) || changes.length === 0) return applied;
		const title = changes.findLast((change) => change.kind === 'rename')?.title;
		const touched = await tx
			.update(decks)
			.set({ updatedAt: sql`now()`, ...(title !== undefined && { title: storable(title) }) })
			.where(eq(decks.id, deckId))
			.returning({ id: decks.id });
		if (touched.length === 0) return applied;
		// Each statement is several round trips to the database worker, so the batch is worked out here and written with
		// a few statements whatever its size.
		if (changes.every(({ kind }) => kind === 'update' || kind === 'rename')) {
			return applyEdits(tx, deckId, changes);
		}
		const stored = await tx
			.select({ id: slides.id, position: slides.position })
			.from(slides)
			.where(eq(slides.deckId, deckId))
			.orderBy(asc(slides.position));
		const list: BatchSlide[] = stored.map(({ id }) => ({ id, isNew: false }));
		const deleted: string[] = [];
		let isStale = false;
		for (const [index, change] of changes.entries()) {
			if (isStale && change.kind !== 'update' && change.kind !== 'rename') continue;
			const isApplied = didApplyToList(list, deleted, change);
			applied[index] = isApplied;
			if (!isApplied) isStale = true;
		}
		await writeList(tx, deckId, stored, list, deleted);
		return applied;
	});
}

/** Applies a batch of edits and renames, which need no list of the slides. */
async function applyEdits(tx: Transaction, deckId: string, changes: readonly DeckChange[]): Promise<boolean[]> {
	const markdowns = new Map<string, string>();
	for (const change of changes) {
		if (change.kind === 'update' && isUuid(change.id)) markdowns.set(change.id, change.markdown);
	}
	const found = new Set(await updateMarkdowns(tx, deckId, markdowns));
	return changes.map((change) => change.kind === 'rename' || found.has(change.id));
}

/** Applies one change to `list`, noting the stored slides it deletes, and returns whether it applied. */
function didApplyToList(list: BatchSlide[], deleted: string[], change: DeckChange): boolean {
	switch (change.kind) {
		case 'rename': {
			return true;
		}
		case 'update': {
			const slide = list.find(({ id }) => id === change.id);
			if (slide) slide.markdown = change.markdown;
			return slide !== undefined;
		}
		case 'insert': {
			const at = clampPosition(change.position, list.length);
			list.splice(at, 0, { id: change.id, isNew: true, markdown: change.markdown });
			return true;
		}
		case 'duplicate': {
			const at = list.findIndex(({ id }) => id === change.of);
			if (at === -1) return false;
			list.splice(at + 1, 0, { id: change.id, isNew: true, markdown: change.markdown });
			return true;
		}
		case 'delete': {
			const at = list.findIndex(({ id }) => id === change.id);
			if (at === -1 || list.length <= 1) return false;
			const [slide] = list.splice(at, 1);
			if (!slide!.isNew) deleted.push(slide!.id);
			return true;
		}
	}
}

/** Writes `list` over the deck's `stored` slides: deletes, then new positions, then new slides and markdown. */
async function writeList(
	tx: Transaction,
	deckId: string,
	stored: readonly { id: string; position: number }[],
	list: readonly BatchSlide[],
	deleted: readonly string[]
) {
	const positions = new Map(stored.map(({ id, position }) => [id, position]));
	const placed = list.map((slide, position) => ({ ...slide, position }));
	const moved = placed
		.filter(({ id, isNew, position }) => !isNew && positions.get(id) !== position)
		.map(({ id, position }) => ({ id, position }));
	const added = placed
		.filter(({ isNew }) => isNew)
		.map(({ id, position, markdown = '' }) => ({ id, deckId, position, markdown: storable(markdown) }));
	if (deleted.length > 0) {
		// The count is in the statement, so the deck ends with a slide whatever this batch believed it held.
		const removed = await tx.execute(sql`
			delete from ${slides}
			where ${slides.deckId} = ${deckId}
				and ${slides.id} in (select value::uuid from jsonb_array_elements_text(${JSON.stringify(deleted)}::jsonb))
				and (select count(*) from ${slides} where ${slides.deckId} = ${deckId}) + ${added.length} > ${deleted.length}
			returning ${slides.id}`);
		if (removed.rows.length !== deleted.length) throw new Error('A batch would have deleted every slide of a deck');
	}
	if (moved.length > 0) {
		// One statement, so the deferrable unique constraint sees only the final positions.
		await tx.execute(sql`
			update ${slides} set position = moved.position
			from jsonb_to_recordset(${JSON.stringify(moved)}::jsonb) as moved(id uuid, position integer)
			where ${slides.id} = moved.id and ${slides.deckId} = ${deckId}`);
	}
	for (let start = 0; start < added.length; start += slidesPerInsert) {
		await tx.insert(slides).values(added.slice(start, start + slidesPerInsert));
	}
	const markdowns = new Map<string, string>();
	for (const { id, isNew, markdown } of list) if (!isNew && markdown !== undefined) markdowns.set(id, markdown);
	await updateMarkdowns(tx, deckId, markdowns);
}

/** Sets the markdown of the deck's slides by id, and returns the ids it found. */
async function updateMarkdowns(tx: Transaction, deckId: string, markdowns: ReadonlyMap<string, string>) {
	if (markdowns.size === 0) return [];
	const edits = [...markdowns].map(([id, markdown]) => ({ id, markdown: storable(markdown) }));
	const updated = await tx.execute<{ id: string }>(sql`
		update ${slides} set markdown = edit.markdown, updated_at = now()
		from jsonb_to_recordset(${JSON.stringify(edits)}::jsonb) as edit(id uuid, markdown text)
		where ${slides.id} = edit.id and ${slides.deckId} = ${deckId}
		returning ${slides.id}`);
	return updated.rows.map(({ id }) => id);
}
