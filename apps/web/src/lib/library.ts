/** How many decks the library holds, as its heading says it. */
export function deckCount(count: number): string {
	return count === 1 ? '1 deck' : `${count} decks`;
}

const minute = 60_000;
const hour = 60 * minute;

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * When a deck was last edited, as its row says it at `now`, in local time: `just now` for under two minutes, then
 * minutes, hours within a day, `yesterday` and days up to 6 by the calendar, then the date, with the year when it isn't
 * this year. An edit after `now`, from a clock that ran ahead, is `just now`.
 */
export function editedWhen(edited: Date, now: Date): string {
	const elapsed = now.getTime() - edited.getTime();
	if (elapsed < 2 * minute) return 'just now';
	if (elapsed < hour) return `${Math.floor(elapsed / minute)} minutes ago`;
	if (elapsed < 2 * hour) return '1 hour ago';
	if (elapsed < 24 * hour) return `${Math.floor(elapsed / hour)} hours ago`;
	// Rounding absorbs the hour a daylight saving change adds to or takes from a day.
	const days = Math.round((startOfDay(now) - startOfDay(edited)) / (24 * hour));
	if (days <= 1) return 'yesterday';
	if (days <= 6) return `${days} days ago`;
	return (edited.getFullYear() === now.getFullYear() ? monthDay : monthDayYear).format(edited);
}

/** Where a row's divider tab sits: rows take left, center and right in turn. */
export type TabPlace = 'left' | 'center' | 'right';

const tabPlaces: readonly TabPlace[] = ['left', 'center', 'right'];

/** The place of the divider tab of the row at `index`, from 0. */
export function tabPlace(index: number): TabPlace {
	return tabPlaces[index % tabPlaces.length]!;
}

/** The title of a duplicated deck. */
export function copyTitle(title: string): string {
	return `${title} (copy)`;
}

/** The title a rename leaves, from the field's `draft`: the old `title` when the draft is empty. */
export function renamedTitle(title: string, draft: string): string {
	return draft.trim() || title;
}

/** What the undo toast says after the decks with these `titles` are deleted. */
export function deletedMessage(titles: readonly string[]): string {
	return titles.length === 1 ? `Deleted “${titles[0]}”` : `Deleted ${titles.length} decks`;
}

/**
 * The library's error messages: the decks that couldn't be listed, a deck that couldn't be made, or a change to one
 * that couldn't be saved.
 */
export const errorLeads = {
	load: "Your decks didn't load:",
	deck: "The deck couldn't be saved:",
	change: "That change couldn't be saved:"
} as const;

const textEntry = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Whether a paste aimed at `target` goes into a field of its own, where the library must leave it alone rather than
 * fill the paste box.
 */
export function isTextEntry(target: EventTarget | null): boolean {
	const element = target as Partial<Pick<Element, 'closest'>> | null;
	return typeof element?.closest === 'function' && Boolean(element.closest(textEntry));
}
