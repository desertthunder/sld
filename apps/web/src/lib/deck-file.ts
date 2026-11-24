import { deckFrontmatter, joinDeck, slideBreak, splitDeck } from '#lib/deck-markdown.ts';
import { settingsFrontmatter } from '#lib/deck-settings.ts';
import type { DeckWithSlides, NewDeck } from '#lib/decks.ts';
import { deckFromNote } from '#lib/handoff.ts';

/** What a deck's markdown file is made from: the deck's own fields and its slides' markdown in order. */
export type DeckFile = { title: string; scheme?: string | null; aspect: string; settings?: unknown; slides: string[] };

/** The largest markdown file the library imports, in bytes. */
export const maxImportBytes = 5 * 1024 * 1024;

const markdownExtension = /\.(?:md|markdown)$/i;
const markdownTypes = new Set(['text/markdown', 'text/x-markdown']);
// Characters Windows, macOS or Linux refuse in a file name, control characters, and the direction marks that could make
// a name read as another extension.
// eslint-disable-next-line no-control-regex -- Control characters are what this removes.
const unsafeCharacters = /[<>:"/\\|?*\u{0}-\u{1F}\u{7F}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu;
// Windows reserves these names before any extension, as in `con.txt`.
const reservedNames = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i;
// File systems take 255 bytes; this leaves room for a number and the extension.
const maxNameBytes = 200;
const encoder = new TextEncoder();

/**
 * A deck as one markdown document, the reverse of importing one: its slides, each as `fileSlide` writes it, joined by
 * `joinDeck`, under TOML frontmatter with its title, scheme, aspect and the settings sld knows.
 */
export function deckMarkdown({ title, scheme, aspect, settings, slides }: DeckFile): string {
	return joinDeck({
		frontmatter: deckFrontmatter({ title, scheme, aspect, ...settingsFrontmatter(settings) }),
		slides: slides.map((slide) => fileSlide(slide))
	});
}

/**
 * A slide's markdown as a deck file holds it, so that importing the file gives the slide back whole. A `---` rule that
 * would read as a separator is written `***`, which draws the same rule; a `+++` that would open a new slide's
 * frontmatter is escaped; a fence left open is closed.
 */
export function fileSlide(slide: string): string {
	const lines = slide.replaceAll(/\r\n?/g, '\n').split('\n');
	let found = slideBreak(lines.join('\n'));
	// Writing one line can change how the lines after it read, so each pass finds the next break in the new text.
	while (found.line !== undefined) {
		lines[found.line] = lines[found.line] === '---' ? '***' : `\\${lines[found.line]}`;
		found = slideBreak(lines.join('\n'));
	}
	if (found.closingFence !== undefined) {
		while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop();
		lines.push(found.closingFence);
	}
	return lines.join('\n');
}

/**
 * The name of a deck's markdown file: its title with the characters file systems refuse taken out, cut to a length in
 * bytes every file system takes, and `deck` when nothing is left.
 */
export function deckFileName(title: string): string {
	const cleaned = title.replaceAll(unsafeCharacters, ' ').replaceAll(/\s+/g, ' ').trim();
	let cut = '';
	let bytes = 0;
	for (const character of cleaned) {
		bytes += encoder.encode(character).length;
		if (bytes > maxNameBytes) break;
		cut += character;
	}
	const name = cut.replaceAll(/^[\s.]+|[\s.]+$/g, '');
	return `${name === '' || reservedNames.test(name) ? 'deck' : name}.md`;
}

// macOS takes names that differ only by case or by how an accent is encoded as the same file.
const nameKey = (name: string) => name.normalize('NFC').toLowerCase();

/**
 * The file names for decks with these titles in one folder, in order, each from `deckFileName`. A name taken already,
 * by any case or accent encoding, is numbered from 2: `Talk.md`, `Talk (2).md`.
 */
export function uniqueFileNames(titles: readonly string[]): string[] {
	const taken = new Set<string>();
	return titles.map((title) => {
		const base = deckFileName(title).slice(0, -'.md'.length);
		let name = `${base}.md`;
		for (let number = 2; taken.has(nameKey(name)); number++) name = `${base} (${number}).md`;
		taken.add(nameKey(name));
		return name;
	});
}

/** Whether a chosen or dropped file is markdown, by its extension or its type. */
export function isMarkdownFile({ name, type }: { name: string; type: string }): boolean {
	return markdownExtension.test(name) || markdownTypes.has(type);
}

/**
 * The deck a markdown file makes, as `deckFromNote` makes one from a paste, except that a file whose frontmatter holds
 * no title takes its file name, without the extension, as the title.
 */
export function deckFromFile(
	name: string,
	markdown: string,
	made: Date = new Date()
): Omit<NewDeck, 'id'> & { slides: string[] } {
	const deck = deckFromNote(markdown, made);
	const fileTitle = name.replace(markdownExtension, '').trim();
	const hasTitle = Boolean(splitDeck(markdown).frontmatter?.title?.trim());
	return hasTitle || fileTitle === '' ? deck : { ...deck, title: fileTitle };
}

/** A stored deck as `deckMarkdown` writes it. */
export function deckFile({ title, scheme, aspect, settings, slides }: DeckWithSlides): DeckFile {
	return { title, scheme, aspect, settings, slides: slides.map(({ markdown }) => markdown) };
}
