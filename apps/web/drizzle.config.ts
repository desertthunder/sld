import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/schema.ts',
	// `db:check` generates into a copy of the migrations to compare them with the schema.
	out: process.env.DRIZZLE_OUT ?? './drizzle'
});
