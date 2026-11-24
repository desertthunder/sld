import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveName, decksArchive } from '#lib/deck-archive.ts';
import { deckFromFile } from '#lib/deck-file.ts';
import type { DeckWithSlides } from '#lib/decks.ts';

// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no scheme as null.
function deck(title: string, slides: string[], scheme: string | null = null): DeckWithSlides {
	const at = new Date(2026, 10, 20, 9, 30);
	return {
		id: crypto.randomUUID(),
		title,
		scheme,
		aspect: '16:9',
		// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no settings as null.
		settings: null,
		createdAt: at,
		updatedAt: at,
		slides: slides.map((markdown, position) => ({
			id: crypto.randomUUID(),
			deckId: '',
			position,
			markdown,
			createdAt: at,
			updatedAt: at
		}))
	};
}

describe('decksArchive', () => {
	it('holds one markdown file per deck, with colliding names numbered, that imports as the deck', () => {
		const decks = [deck('Talk', ['# One', '## Two'], 'nord'), deck('Talk', []), deck('Q3: plans', ['# Q3'])];
		const files = unzipSync(decksArchive(decks));
		expect(Object.keys(files)).toEqual(['Talk.md', 'Talk (2).md', 'Q3 plans.md']);
		expect(deckFromFile('Talk.md', strFromU8(files['Talk.md']!))).toEqual({
			title: 'Talk',
			scheme: 'nord',
			aspect: '16:9',
			slides: ['# One', '## Two']
		});
		expect(deckFromFile('Q3 plans.md', strFromU8(files['Q3 plans.md']!)).title).toBe('Q3: plans');
	});

	it('holds no files when there are no decks', () => {
		expect(unzipSync(decksArchive([]))).toEqual({});
	});
});

describe('archiveName', () => {
	it('dates the archive by the local day', () => {
		expect(archiveName(new Date(2026, 0, 5, 23, 59))).toBe('sld decks 2026-01-05.zip');
	});
});
