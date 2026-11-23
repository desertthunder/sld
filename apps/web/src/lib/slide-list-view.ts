/** How the slide list shows each slide: as a thumbnail beside its number, or as its heading only. */
export type ListView = 'thumbnails' | 'headings';

/** The `localStorage` key that holds the slide list's view. */
export const listViewKey = 'sld:slide-list-view';

/** Reads a stored view, falling back to thumbnails. */
export function parseListView(stored: string | undefined): ListView {
	return stored === 'headings' ? 'headings' : 'thumbnails';
}

/** The stored view, or thumbnails when storage is blocked or holds none. */
export function readListView(storage: () => Pick<Storage, 'getItem'>): ListView {
	try {
		return parseListView(storage().getItem(listViewKey) ?? undefined);
	} catch {
		return 'thumbnails';
	}
}

/** Stores the view. Storage can be full or blocked, and the view then lasts only as long as the page. */
export function writeListView(storage: () => Pick<Storage, 'setItem'>, view: ListView) {
	try {
		storage().setItem(listViewKey, view);
	} catch {
		// The view stays as chosen until the page closes.
	}
}
