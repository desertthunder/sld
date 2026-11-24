import { describe, expect, it } from 'vitest';
import { slideFrontmatter, splitDeck } from '#lib/deck-markdown.ts';
import {
	deckFileName,
	deckFromFile,
	deckMarkdown,
	isMarkdownFile,
	uniqueFileNames,
	type DeckFile
} from '#lib/deck-file.ts';

const lines = (...rows: string[]) => rows.join('\n');
const made = new Date(2026, 10, 24);

/** The deck a file imports as, in the shape `deckMarkdown` takes, with the aspect the database fills in. */
function imported(name: string, markdown: string): DeckFile {
	const { title, scheme, aspect = '16:9', settings, slides } = deckFromFile(name, markdown, made);
	return { title, scheme, aspect, settings, slides };
}

/** A deck as an import gives it back: a scheme or settings stored as null come back undefined. */
function expected({ scheme, settings, ...deck }: DeckFile): DeckFile {
	return { ...deck, scheme: scheme ?? undefined, settings: settings ?? undefined };
}

describe('deckMarkdown', () => {
	it('writes the title, scheme, aspect and known settings as TOML frontmatter above the slides', () => {
		const deck: DeckFile = {
			title: 'Talk',
			scheme: 'gruvbox-dark',
			aspect: '4:3',
			settings: { slideNumber: true, unknown: 1 },
			slides: ['# One', '## Two']
		};
		expect(deckMarkdown(deck)).toBe(
			lines(
				'+++',
				'title = "Talk"',
				'scheme = "gruvbox-dark"',
				'aspect = "4:3"',
				'slideNumber = true',
				'+++',
				'',
				'# One',
				'',
				'---',
				'',
				'## Two',
				''
			)
		);
	});

	it('leaves out a scheme and settings the deck does not have', () => {
		// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no scheme or settings as null.
		const deck: DeckFile = { title: 'Talk', scheme: null, aspect: '16:9', settings: null, slides: [] };
		expect(deckMarkdown(deck)).toBe(lines('+++', 'title = "Talk"', 'aspect = "16:9"', '+++', ''));
	});
});

describe('exporting then importing', () => {
	const pieces = [
		['# Title'],
		['Some text with `<script>` in code.'],
		['- item'],
		['> quote'],
		['---'],
		['', '---', ''],
		['', '---', ''],
		['```', '---', '```'],
		['```md', '', '---', '', '+++', 'a = 1', '+++', '```'],
		['---', 'layout: center', 'class: big', '---'],
		['+++', 'layout = "center"', '+++'],
		['', '---', 'scheme: nord', 'notes: Say hello', '---', ''],
		['', '---', '+++', 'layout = "two-column"', '+++', ''],
		['title: not frontmatter'],
		['<div class="cols">'],
		['| a | b |', '| --- | --- |']
	];
	const titles = ['Talk', 'A "quoted" title', "It's 50% done", 'Title with """ and \\', 'Ünïcödé 😀', '+++', '---'];
	// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no scheme as null.
	const schemes = [null, undefined, 'gruvbox-dark', 'nord'];
	const aspects = ['16:9', '4:3'];
	// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no settings as null.
	const settings = [null, undefined, { slideNumber: true }, { slideNumber: false }];
	let seed = 12;
	const random = () => {
		seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
		return seed / 4_294_967_296;
	};
	const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
	// Slides as a paste or an import stores them: split from a document, some with CRLF line endings.
	const decks: DeckFile[] = Array.from({ length: 2000 }, () => {
		const document = Array.from({ length: Math.floor(random() * 12) }, () => pick(pieces))
			.flat()
			.join(random() < 0.2 ? '\r\n' : '\n');
		return {
			title: pick(titles),
			scheme: pick(schemes),
			aspect: pick(aspects),
			settings: pick(settings),
			slides: splitDeck(document).slides
		};
	});

	it('gives back the same slides, title, scheme, aspect and settings', () => {
		expect(decks.filter(({ slides }) => slides.length === 0).length).toBeGreaterThan(0);
		expect(decks.filter(({ slides }) => slides[0] && slideFrontmatter(slides[0])).length).toBeGreaterThan(0);
		expect(decks.filter(({ slides }) => slides.some((slide) => slide.includes('```\n---'))).length).toBeGreaterThan(
			0
		);
		for (const deck of decks) {
			const markdown = deckMarkdown(deck);
			expect(imported(deckFileName(deck.title), markdown), markdown).toEqual(expected(deck));
		}
	});

	it('keeps an empty deck, and a first slide with frontmatter of its own', () => {
		// eslint-disable-next-line unicorn/no-null -- The database stores a deck with no scheme or settings as null.
		const empty: DeckFile = { title: 'Empty', scheme: null, aspect: '16:9', settings: null, slides: [] };
		expect(imported('Empty.md', deckMarkdown(empty))).toEqual(expected(empty));
		const first: DeckFile = {
			...empty,
			title: 'Talk',
			scheme: 'nord',
			slides: [lines('---', 'layout: center', 'scheme: gruvbox-dark', 'class: big', '---', '', '# One'), '# Two']
		};
		expect(imported('Talk.md', deckMarkdown(first))).toEqual(expected(first));
	});
});

describe('deckFromFile', () => {
	it('takes the file name as the title of a file with no frontmatter', () => {
		expect(deckFromFile('Field notes.md', '# A heading\n\nText', made).title).toBe('Field notes');
		expect(deckFromFile('notes.MARKDOWN', '', made).title).toBe('notes');
	});

	it('takes the file name as the title when the frontmatter holds none', () => {
		expect(deckFromFile('Talk.md', '---\nscheme: nord\n---\n\n# One', made)).toEqual({
			title: 'Talk',
			scheme: 'nord',
			slides: ['# One']
		});
	});

	it('takes the frontmatter title over the file name', () => {
		expect(deckFromFile('talk (2).md', '+++\ntitle = "Talk"\n+++\n\n# One', made).title).toBe('Talk');
	});

	it('falls back to the title a paste would get when the file name is only an extension', () => {
		expect(deckFromFile('.md', '# Heading', made).title).toBe('Heading');
	});
});

describe('deckFileName', () => {
	it('names the file after the title', () => {
		expect(deckFileName('Field notes on sleep')).toBe('Field notes on sleep.md');
	});

	it('takes out characters file systems refuse', () => {
		expect(deckFileName('Q3: plans / "goals" <draft>?*|\\')).toBe('Q3 plans goals draft.md');
		expect(deckFileName('tab\there\nand there')).toBe('tab here and there.md');
	});

	it('trims dots and spaces at either end and cuts a long title', () => {
		expect(deckFileName('  ..hidden. ')).toBe('hidden.md');
		expect(deckFileName('😀'.repeat(200))).toBe(`${'😀'.repeat(120)}.md`);
	});

	it('falls back to deck.md when nothing usable is left', () => {
		expect(deckFileName('')).toBe('deck.md');
		expect(deckFileName('/:*?')).toBe('deck.md');
		expect(deckFileName('...')).toBe('deck.md');
		expect(deckFileName('CON')).toBe('deck.md');
	});
});

describe('uniqueFileNames', () => {
	it('numbers names that collide, by any case, from 2', () => {
		expect(uniqueFileNames(['Talk', 'Talk', 'talk', 'Other', 'Talk (2)'])).toEqual([
			'Talk.md',
			'Talk (2).md',
			'talk (3).md',
			'Other.md',
			'Talk (2) (2).md'
		]);
	});

	it('numbers titles that only differ by characters a file name drops', () => {
		expect(uniqueFileNames(['A/B', 'A:B', '', '?'])).toEqual(['A B.md', 'A B (2).md', 'deck.md', 'deck (2).md']);
	});
});

describe('isMarkdownFile', () => {
	it('takes a .md or .markdown file, or a file typed as markdown', () => {
		expect(isMarkdownFile({ name: 'Talk.md', type: '' })).toBe(true);
		expect(isMarkdownFile({ name: 'Talk.MarkDown', type: '' })).toBe(true);
		expect(isMarkdownFile({ name: 'Talk', type: 'text/markdown' })).toBe(true);
	});

	it('refuses other files', () => {
		expect(isMarkdownFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
		expect(isMarkdownFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
		expect(isMarkdownFile({ name: 'md', type: '' })).toBe(false);
	});
});
