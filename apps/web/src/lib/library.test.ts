import { describe, expect, it } from 'vitest';
import {
	copyTitle,
	deckCount,
	deletedMessage,
	editedWhen,
	errorLeads,
	isTextEntry,
	renamedTitle,
	tabPlace
} from '#lib/library.ts';

describe('editedWhen', () => {
	// Local time, so the calendar-day cases hold in every time zone.
	const now = new Date(2026, 10, 22, 15, 30);
	const before = (milliseconds: number) => new Date(now.getTime() - milliseconds);
	const minutes = (count: number) => before(count * 60_000);
	const hours = (count: number) => minutes(count * 60);

	it('says just now for under two minutes, and for a time after now', () => {
		expect(editedWhen(now, now)).toBe('just now');
		expect(editedWhen(before(119_999), now)).toBe('just now');
		expect(editedWhen(minutes(-5), now)).toBe('just now');
	});

	it('counts minutes up to an hour', () => {
		expect(editedWhen(minutes(2), now)).toBe('2 minutes ago');
		expect(editedWhen(before(59 * 60_000 + 59_999), now)).toBe('59 minutes ago');
	});

	it('counts hours up to a day', () => {
		expect(editedWhen(hours(1), now)).toBe('1 hour ago');
		expect(editedWhen(minutes(119), now)).toBe('1 hour ago');
		expect(editedWhen(hours(2), now)).toBe('2 hours ago');
		expect(editedWhen(minutes(24 * 60 - 1), now)).toBe('23 hours ago');
	});

	it('says hours, not yesterday, for an edit late last night', () => {
		const morning = new Date(2026, 10, 22, 1, 0);
		expect(editedWhen(new Date(2026, 10, 21, 23, 0), morning)).toBe('2 hours ago');
	});

	it('counts calendar days from a day back, up to 6', () => {
		expect(editedWhen(hours(24), now)).toBe('yesterday');
		expect(editedWhen(new Date(2026, 10, 21, 0, 5), now)).toBe('yesterday');
		expect(editedWhen(new Date(2026, 10, 20, 23, 59), now)).toBe('2 days ago');
		expect(editedWhen(new Date(2026, 10, 16, 0, 0), now)).toBe('6 days ago');
	});

	it('gives the date from a week back, with the year only when it is not this year', () => {
		expect(editedWhen(new Date(2026, 10, 15, 23, 59), now)).toBe('Nov 15');
		expect(editedWhen(new Date(2026, 10, 2, 9, 0), now)).toBe('Nov 2');
		expect(editedWhen(new Date(2026, 0, 1, 0, 0), now)).toBe('Jan 1');
		expect(editedWhen(new Date(2025, 10, 2, 9, 0), now)).toBe('Nov 2, 2025');
	});

	it('counts days across the new year, and gives a date from last year with its year', () => {
		const newYear = new Date(2027, 0, 2, 12, 0);
		expect(editedWhen(new Date(2026, 11, 30, 12, 0), newYear)).toBe('3 days ago');
		expect(editedWhen(new Date(2026, 11, 20, 12, 0), newYear)).toBe('Dec 20, 2026');
	});
});

describe('library copy', () => {
	it('counts decks', () => {
		expect(deckCount(1)).toBe('1 deck');
		expect(deckCount(0)).toBe('0 decks');
		expect(deckCount(12)).toBe('12 decks');
	});

	it('names a copy and a deleted deck', () => {
		expect(copyTitle('Thesis defense')).toBe('Thesis defense (copy)');
		expect(deletedMessage('Thesis defense')).toBe('Deleted “Thesis defense”');
	});

	it('says the decks did not load apart from a change that was not saved', () => {
		expect(errorLeads.load).toBe("Your decks didn't load:");
		expect(errorLeads.change).toBe("That change couldn't be saved:");
	});

	it('keeps the old title when a rename leaves the field empty', () => {
		expect(renamedTitle('Talk', '  Better talk ')).toBe('Better talk');
		expect(renamedTitle('Talk', ' '.repeat(3))).toBe('Talk');
		expect(renamedTitle('Talk', '')).toBe('Talk');
	});
});

describe('divider tabs', () => {
	it('take left, center and right in turn', () => {
		expect([0, 1, 2, 3, 4, 5, 6].map((index) => tabPlace(index))).toEqual([
			'left',
			'center',
			'right',
			'left',
			'center',
			'right',
			'left'
		]);
	});
});

const fieldQuery = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** A stand-in for an element whose `closest` finds a match only for `selector`. */
function elementMatching(selector: string | undefined): EventTarget {
	return { closest: (query: string) => (selector === query ? {} : undefined) } as unknown as EventTarget;
}

describe('isTextEntry', () => {
	it('is true inside a field, and false elsewhere or for a target that is not an element', () => {
		expect(isTextEntry(elementMatching(fieldQuery))).toBe(true);
		expect(isTextEntry(elementMatching(undefined))).toBe(false);
		expect(isTextEntry({} as EventTarget)).toBe(false);
	});
});
