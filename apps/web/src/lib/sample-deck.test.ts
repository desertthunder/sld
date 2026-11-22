import { expect, it } from 'vitest';
import { deckFromNote } from '#lib/handoff.ts';
import { sampleDeck } from '#lib/sample-deck.ts';

it('makes the six-slide deck "How to write Markdown"', () => {
	const deck = deckFromNote(sampleDeck);
	expect(deck.title).toBe('How to write Markdown');
	expect(deck.slides.map((slide) => slide.split('\n', 1)[0])).toEqual([
		'# How to write Markdown',
		'## Headings',
		'## Emphasis',
		'## Lists',
		'## Links and code',
		'## New slides'
	]);
	expect(deck.slides[5]).toBe(
		'## New slides\n\nA line with only `---`, with a blank line above it, starts a new slide.'
	);
});
