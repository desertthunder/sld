// Postgres throws on an id that is not a uuid. The queries take only the canonical form the database returns, though
// Postgres would also read braced or unhyphenated uuids.
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Whether `id` is a uuid in the form the deck queries take. */
export function isUuid(id: string): boolean {
	return uuid.test(id);
}
