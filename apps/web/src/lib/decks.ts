import { and, asc, count, desc, eq, gt, gte, sql } from 'drizzle-orm';
import { writeDurably, type Database } from '#lib/database.ts';
import { announceDeckChange, type DeckChangeKind } from '#lib/deck-signal.ts';
import type { DeckSettings } from '#lib/deck-settings.ts';
import { decks, slides } from '#lib/schema.ts';
import { isUuid } from '#lib/uuid.ts';

export type Deck = typeof decks.$inferSelect;
export type Slide = typeof slides.$inferSelect;

/** A deck with its slides in order. */
export type DeckWithSlides = Deck & { slides: Slide[] };

/**
 * What a new deck needs: its title, and optionally its id, scheme, aspect, settings and the markdown of its slides in
 * order. Give an id to make the write safe to repeat: a second deck with the same id fails to insert.
 */
export type NewDeck = {
	id?: string;
	title: string;
	scheme?: string | null;
	aspect?: string;
	settings?: DeckSettings | null;
	slides?: readonly string[];
};

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Every write below goes through `writeDurably`, so a write that resolves is in IndexedDB.
function write<T>(database: Database, change: (tx: Transaction) => Promise<T>): Promise<T> {
	return writeDurably(database, (database) => database.transaction(change));
}

// Each write that changed a deck then tells the other tabs, which may have it open.
function announced<T extends { id: string } | { deckId: string } | undefined>(
	row: T,
	changed: readonly DeckChangeKind[]
): T {
	if (row) announceDeckChange('deckId' in row ? row.deckId : row.id, changed);
	return row;
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

// Postgres text cannot hold U+0000, and JSON cast to `jsonb` refuses a lone surrogate. CommonMark replaces U+0000 with
// U+FFFD, and so does encoding text as UTF-8 a lone surrogate, so markdown means the same either way.
function storable(text: string): string {
	return text.replaceAll('\0', '\u{FFFD}').toWellFormed();
}

// Postgres binds at most 65,535 parameters to one statement, and each slide row takes three.
const slidesPerInsert = 1000;

async function insertSlideRows(tx: Transaction, rows: (typeof slides.$inferInsert)[]) {
	for (let start = 0; start < rows.length; start += slidesPerInsert) {
		await tx.insert(slides).values(rows.slice(start, start + slidesPerInsert));
	}
}

function clampPosition(position: number, last: number): number {
	if (!Number.isSafeInteger(position)) throw new RangeError(`A slide position must be an integer, not ${position}`);
	return Math.min(Math.max(position, 0), last);
}

/** Creates a deck, with its slides when `slides` lists their markdown, and returns it. */
export async function createDeck(
	database: Database,
	{ slides: markdowns = [], title, scheme, aspect, ...fields }: NewDeck
): Promise<Deck> {
	const deck = await write(database, async (tx) => {
		const [deck] = await tx
			.insert(decks)
			.values({
				...fields,
				title: storable(title),
				scheme: scheme && storable(scheme),
				aspect: aspect && storable(aspect)
			})
			.returning();
		await insertSlideRows(
			tx,
			markdowns.map((markdown, position) => ({ deckId: deck!.id, position, markdown: storable(markdown) }))
		);
		return deck!;
	});
	return announced(deck, ['created']);
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
export async function renameDeck(database: Database, id: string, title: string): Promise<Deck | undefined> {
	const renamed = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx
			.update(decks)
			.set({ title: storable(title), updatedAt: sql`now()` })
			.where(eq(decks.id, id))
			.returning();
		return deck;
	});
	return announced(renamed, ['title']);
}

/** Sets the slug of a deck's scheme and returns the deck, or `undefined` when there is no such deck. */
export async function setDeckScheme(database: Database, id: string, scheme: string): Promise<Deck | undefined> {
	const changed = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx
			.update(decks)
			.set({ scheme: storable(scheme), updatedAt: sql`now()` })
			.where(eq(decks.id, id))
			.returning();
		return deck;
	});
	return announced(changed, ['scheme']);
}

/** Deletes a deck and its slides, and returns the deck, or `undefined` when there is no such deck. */
export async function deleteDeck(database: Database, id: string): Promise<Deck | undefined> {
	const deleted = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx.delete(decks).where(eq(decks.id, id)).returning();
		return deck;
	});
	return announced(deleted, ['deleted']);
}

/**
 * Inserts a slide into a deck at `position`, moving the slides from there on one place later, and returns it. A
 * position past the end appends the slide. It returns `undefined` when there is no such deck.
 */
export async function insertSlide(
	database: Database,
	deckId: string,
	position: number,
	markdown: string
): Promise<Slide | undefined> {
	const slide = await write(database, async (tx) => {
		if (!isUuid(deckId)) return;
		const touched = await touchDeck(tx, deckId).returning({ id: decks.id });
		if (touched.length === 0) return;
		const at = clampPosition(position, await slideCount(tx, deckId));
		return insertAt(tx, deckId, at, storable(markdown));
	});
	return announced(slide, ['slides']);
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
export async function updateSlide(database: Database, id: string, markdown: string): Promise<Slide | undefined> {
	const updated = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx
			.update(slides)
			.set({ markdown: storable(markdown), updatedAt: sql`now()` })
			.where(eq(slides.id, id))
			.returning();
		if (slide) await touchDeck(tx, slide.deckId);
		return slide;
	});
	return announced(updated, ['text']);
}

/**
 * Deletes a slide, moving the slides after it one place earlier, and returns it. It returns `undefined`, and deletes
 * nothing, when there is no such slide or the slide is its deck's only one, since a deck always keeps a slide.
 */
export async function deleteSlide(database: Database, id: string): Promise<Slide | undefined> {
	const deleted = await write(database, async (tx) => {
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
	return announced(deleted, ['slides']);
}

/** Copies a slide to the place right after it and returns the copy, or `undefined` when there is no such slide. */
export async function duplicateSlide(database: Database, id: string): Promise<Slide | undefined> {
	const copy = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [slide] = await tx.select().from(slides).where(eq(slides.id, id));
		if (!slide) return;
		await touchDeck(tx, slide.deckId);
		return insertAt(tx, slide.deckId, slide.position + 1, slide.markdown);
	});
	return announced(copy, ['slides']);
}

/**
 * Moves a slide to `position` within its deck, shifting the slides between its old and new place by one, and returns
 * the deck's slides in their new order, or `undefined` when there is no such slide. A position past the end moves it
 * to the end.
 */
export async function moveSlide(database: Database, id: string, position: number): Promise<Slide[] | undefined> {
	const moved = await write(database, async (tx) => {
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
	announced(moved?.[0], ['slides']);
	return moved;
}

/** A deck with how many slides it has, as the library lists it. */
export type DeckSummary = Deck & { slideCount: number };

/** Lists every deck with its slide count, the most recently changed first. */
export function listDeckSummaries(database: Database): Promise<DeckSummary[]> {
	return database.transaction(async (tx) => {
		const rows = await tx.select().from(decks).orderBy(desc(decks.updatedAt), asc(decks.title));
		const counts = await tx.select({ deckId: slides.deckId, total: count() }).from(slides).groupBy(slides.deckId);
		const totals = new Map(counts.map(({ deckId, total }) => [deckId, total]));
		return rows.map((deck) => ({ ...deck, slideCount: totals.get(deck.id) ?? 0 }));
	});
}

/** Lists every deck with its slides in order, the most recently changed first, as exporting every deck needs them. */
export function listDecksWithSlides(database: Database): Promise<DeckWithSlides[]> {
	return database.transaction(async (tx) => {
		const rows = await tx.select().from(decks).orderBy(desc(decks.updatedAt), asc(decks.title));
		const all = await tx.select().from(slides).orderBy(asc(slides.deckId), asc(slides.position));
		const byDeck = Map.groupBy(all, ({ deckId }) => deckId);
		return rows.map((deck) => ({ ...deck, slides: byDeck.get(deck.id) ?? [] }));
	});
}

/**
 * Copies a deck, its settings and its slides in order, as a new deck titled `title`, and returns the copy, or
 * `undefined` when there is no such deck.
 */
export async function duplicateDeck(database: Database, id: string, title: string): Promise<Deck | undefined> {
	const copy = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [source] = await tx.select().from(decks).where(eq(decks.id, id));
		if (!source) return;
		// Columns left undefined take their defaults: a new id, and the time of the copy.
		const [copy] = await tx
			.insert(decks)
			.values({ ...source, id: undefined, createdAt: undefined, updatedAt: undefined, title: storable(title) })
			.returning();
		const rows = await tx.select().from(slides).where(eq(slides.deckId, id)).orderBy(asc(slides.position));
		await insertSlideRows(
			tx,
			rows.map(({ position, markdown }) => ({ deckId: copy!.id, position, markdown }))
		);
		return copy!;
	});
	return announced(copy, ['created']);
}

/**
 * Deletes a deck and its slides, and returns them as they were, for `restoreDecks` to put back, or `undefined` when
 * there is no such deck.
 */
export async function removeDeck(database: Database, id: string): Promise<DeckWithSlides | undefined> {
	const removed = await write(database, async (tx) => {
		if (!isUuid(id)) return;
		const [deck] = await tx.select().from(decks).where(eq(decks.id, id));
		if (!deck) return;
		const rows = await tx.select().from(slides).where(eq(slides.deckId, id)).orderBy(asc(slides.position));
		await tx.delete(decks).where(eq(decks.id, id));
		return { ...deck, slides: rows };
	});
	return announced(removed, ['deleted']);
}

/**
 * Puts back decks that `removeDeck` returned, exactly as they were: the same ids, titles, settings, times and slides in
 * order. It returns the decks in the order given, and rejects, restoring none of them, when a deck with one of their ids
 * exists.
 */
export async function restoreDecks(database: Database, removed: readonly DeckWithSlides[]): Promise<Deck[]> {
	const restored = await write(database, async (tx) => {
		const restored: Deck[] = [];
		for (const { slides: rows, ...deck } of removed) {
			const [row] = await tx.insert(decks).values(deck).returning();
			await insertSlideRows(tx, rows);
			restored.push(row!);
		}
		return restored;
	});
	for (const deck of restored) announced(deck, ['created']);
	return restored;
}

/**
 * One change to a deck, as `applyDeckChanges` takes it: an edit to a slide's markdown, a new slide right after the
 * slide `after`, a copy of a slide right after it, a slide to delete, a new title, or the slug of a new scheme. A change
 * names slides by id, never by position, so it lands where it was asked for whatever another tab did to the order.
 */
export type DeckChange =
	| { kind: 'update'; id: string; markdown: string }
	| { kind: 'insert'; id: string; after: string; markdown: string }
	| { kind: 'duplicate'; of: string; id: string; markdown: string }
	| { kind: 'delete'; id: string }
	| { kind: 'rename'; title: string }
	| { kind: 'scheme'; scheme: string };

// A slide as a batch leaves it: whether the batch inserts it, and its markdown when the batch sets that.
type BatchSlide = { id: string; isNew: boolean; markdown?: string };

/**
 * Applies `changes` to a deck in order, in one transaction made durable once, and resolves to whether each one applied.
 * A change doesn't apply when its slide, or the slide an insert follows, is gone, when it would delete the deck's last slide, or when the deck is gone,
 * which applies none. After a change that doesn't apply, the inserts, copies and deletes are skipped too, since they
 * were asked for on a list that no longer matches; edits, renames and schemes still apply. A failure rolls back every change.
 */
export async function applyDeckChanges(
	database: Database,
	deckId: string,
	changes: readonly DeckChange[]
): Promise<boolean[]> {
	const applied = await write(database, async (tx) => {
		const applied: boolean[] = changes.map(() => false);
		if (!isUuid(deckId) || changes.length === 0) return applied;
		const title = changes.findLast((change) => change.kind === 'rename')?.title;
		const scheme = changes.findLast((change) => change.kind === 'scheme')?.scheme;
		const touched = await tx
			.update(decks)
			.set({
				updatedAt: sql`now()`,
				...(title !== undefined && { title: storable(title) }),
				...(scheme !== undefined && { scheme: storable(scheme) })
			})
			.where(eq(decks.id, deckId))
			.returning({ id: decks.id });
		if (touched.length === 0) return applied;
		// Each statement is several round trips to the database worker, so the batch is worked out here and written with
		// a few statements whatever its size.
		if (changes.every((change) => isListFree(change))) {
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
			if (isStale && !isListFree(change)) continue;
			const isApplied = didApplyToList(list, deleted, change);
			applied[index] = isApplied;
			if (!isApplied) isStale = true;
		}
		await writeList(tx, deckId, stored, list, deleted);
		return applied;
	});
	announceDeckChange(
		deckId,
		changes.filter((_, index) => applied[index]).map(({ kind }) => signalKinds[kind])
	);
	return applied;
}

const signalKinds: Record<DeckChange['kind'], DeckChangeKind> = {
	update: 'text',
	insert: 'slides',
	duplicate: 'slides',
	delete: 'slides',
	rename: 'title',
	scheme: 'scheme'
};

const listFreeKinds: ReadonlySet<DeckChange['kind']> = new Set(['update', 'rename', 'scheme']);

/** Whether a change is an edit, a rename or a scheme, which need no list of the slides. */
function isListFree({ kind }: DeckChange): boolean {
	return listFreeKinds.has(kind);
}

/** Applies a batch of edits, renames and schemes, which need no list of the slides. */
async function applyEdits(tx: Transaction, deckId: string, changes: readonly DeckChange[]): Promise<boolean[]> {
	const markdowns = new Map<string, string>();
	for (const change of changes) {
		if (change.kind === 'update' && isUuid(change.id)) markdowns.set(change.id, change.markdown);
	}
	const found = new Set(await updateMarkdowns(tx, deckId, markdowns));
	return changes.map((change) => change.kind === 'rename' || change.kind === 'scheme' || found.has(change.id));
}

/** Applies one change to `list`, noting the stored slides it deletes, and returns whether it applied. */
function didApplyToList(list: BatchSlide[], deleted: string[], change: DeckChange): boolean {
	switch (change.kind) {
		case 'rename':
		case 'scheme': {
			return true;
		}
		case 'update': {
			const slide = list.find(({ id }) => id === change.id);
			if (slide) slide.markdown = change.markdown;
			return slide !== undefined;
		}
		case 'insert':
		case 'duplicate': {
			const at = list.findIndex(({ id }) => id === (change.kind === 'insert' ? change.after : change.of));
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
