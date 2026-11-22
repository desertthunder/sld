import { describe, expect, it } from 'vitest';
import { splitDeck } from '#lib/deck-markdown.ts';
import { deckTitle, firstHeading, untitledDeck } from '#lib/deck-title.ts';

describe('untitledDeck', () => {
	it('names the local day the deck was made', () => {
		expect(untitledDeck(new Date(2026, 10, 22, 0, 5))).toBe('Untitled Deck - 2026-11-22');
		expect(untitledDeck(new Date(2026, 0, 3, 23, 59))).toBe('Untitled Deck - 2026-01-03');
	});
});

describe('firstHeading', () => {
	it.each([
		['an ATX heading', 'Intro text\n\n## The pattern\n\n# Later', 'The pattern'],
		['a closed ATX heading', '## Closed heading ##', 'Closed heading'],
		['a setext heading', 'Plain title\n===', 'Plain title'],
		['a setext heading over two lines', 'Plain\ntitle\n---', 'Plain title'],
		['a heading after fenced code', '```sh\n# not a heading\n```\n\n# Real', 'Real'],
		['a heading after a tilde fence holding backticks', '~~~\n```\n# no\n~~~\n# Yes', 'Yes'],
		['a heading after an empty one', '#\n\n# Named', 'Named']
	])('finds %s', (_case, markdown, heading) => {
		expect(firstHeading(markdown)).toBe(heading);
	});

	it.each([
		['plain text', 'Just a line'],
		['a list item', '- First item'],
		['a quote', '> Quoted line'],
		['a hashtag', '#notaheading'],
		['a thematic break under a list', '- item\n---'],
		['indented code', '    # code\n    ---'],
		['an unclosed fence', '```\n# inside']
	])('finds none in %s', (_case, markdown) => {
		expect(firstHeading(markdown)).toBeUndefined();
	});
});

describe('deckTitle', () => {
	const made = new Date(2026, 10, 22);

	it('takes the frontmatter title first', () => {
		expect(deckTitle(splitDeck('---\ntitle: Talk\n---\n\n# Heading\n'), made)).toBe('Talk');
	});

	it('takes the first heading in any slide when the frontmatter has no title', () => {
		expect(deckTitle(splitDeck('---\ntitle: "  "\n---\n\nIntro\n\n---\n\n## Second\n'), made)).toBe('Second');
	});

	it('skips a heading-like line in a slide frontmatter', () => {
		expect(deckTitle(splitDeck('Intro\n\n---\n\n+++\nlayout = "title"\n# a comment\n+++\n\nText\n'), made)).toBe(
			'Untitled Deck - 2026-11-22'
		);
	});

	it('names a deck with no heading for the day it was made', () => {
		expect(deckTitle(splitDeck('Just a paragraph'), made)).toBe('Untitled Deck - 2026-11-22');
	});
});
