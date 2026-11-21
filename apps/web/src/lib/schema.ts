import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** The migrations already applied to this database, by the tag drizzle-kit gave each one. */
export const appliedMigrations = pgTable('migrations', {
	tag: text().primaryKey(),
	appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow()
});
