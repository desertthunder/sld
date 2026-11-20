// TODO: call requestPersistentStorage from deck creation when the first deck is saved.
/**
 * Asks the browser not to evict this site's storage, so decks survive storage pressure. Call it once the first deck
 * exists: browsers weigh how the site is used, and can refuse a request made before anything is stored.
 */
export async function requestPersistentStorage(
	storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage
): Promise<void> {
	if (!storage || (await storage.persisted())) return;
	await storage.persist();
}
