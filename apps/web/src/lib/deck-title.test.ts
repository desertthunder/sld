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
		['a heading after an empty one', '#\n\n# Named', 'Named'],
		['a heading after an empty one with a closing sequence', '## ##\n\n# #\n\n# C#', 'C#'],
		['a heading as plain text', '# **Bold** title', 'Bold title'],
		['a heading holding code', '# Using `code`', 'Using code'],
		['a heading holding a link', '# [Link](https://x)', 'Link'],
		['a heading holding both emphases', '# _a_ and *b*', 'a and b'],
		['a heading holding escapes', String.raw`# \*Starred\* \#1`, '*Starred* #1'],
		['a heading holding HTML', '# <span>Tagged</span> <b>title</b>', 'Tagged title'],
		['a heading holding a file name', '# my_file_name.ts', 'my_file_name.ts'],
		['a setext heading as plain text', '**Bold**\nsetext\n===', 'Bold setext'],
		['a heading after one that strips to nothing', '# <br>\n\n## Real', 'Real'],
		['a setext heading holding an empty code span', 'Text `` `` <br>\n===\n\n# Next', 'Text'],
		['a heading after a setext one that strips to nothing', '`` `` <br>\n===\n\n# Next', 'Next']
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

	it('stays fast on a long heading line', () => {
		const start = performance.now();
		expect(firstHeading(`# a${' '.repeat(100_000)}b ##`)).toBe('a');
		expect(performance.now() - start).toBeLessThan(100);
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

	it('keeps the frontmatter title as written', () => {
		expect(deckTitle(splitDeck('---\ntitle: "  **Talk** about `code`  "\n---\n\n# Heading\n'), made)).toBe(
			'**Talk** about `code`'
		);
	});

	it('takes a later heading when the first strips to nothing', () => {
		expect(deckTitle(splitDeck('# <br>\n\n---\n\n## <span>Second</span>\n'), made)).toBe('Second');
	});

	it('names a deck whose only heading strips to nothing for the day it was made', () => {
		expect(deckTitle(splitDeck('# <br/>'), made)).toBe('Untitled Deck - 2026-11-22');
	});

	it('names a deck with no heading for the day it was made', () => {
		expect(deckTitle(splitDeck('Just a paragraph'), made)).toBe('Untitled Deck - 2026-11-22');
	});
});
