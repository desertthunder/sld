import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** The migrations already applied to this database, by the tag drizzle-kit gave each one. */
export const appliedMigrations = pgTable('migrations', {
	tag: text().primaryKey(),
	appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * A deck. `scheme` is the slug of its Base16 scheme, or null for the app's default schemes. `settings` holds how it
 * presents, as `#lib/deck-settings.ts` reads it, or null for the defaults.
 */
export const decks = pgTable('decks', {
	id: uuid().primaryKey().defaultRandom(),
	title: text().notNull(),
	scheme: text(),
	aspect: text().notNull().default('16:9'),
	settings: jsonb(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * A slide of a deck, at `position` from 0. Its markdown is the only source for its content. The migration makes the
 * unique `(deck_id, position)` constraint deferrable, which Drizzle cannot say, so renumbering many slides in one
 * statement is checked only once the statement ends.
 */
export const slides = pgTable(
	'slides',
	{
		id: uuid().primaryKey().defaultRandom(),
		deckId: uuid('deck_id')
			.notNull()
			.references(() => decks.id, { onDelete: 'cascade' }),
		position: integer().notNull(),
		markdown: text().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('slides_deck_id_position_unique').on(table.deckId, table.position)]
);
