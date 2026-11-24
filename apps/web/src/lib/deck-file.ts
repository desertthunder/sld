import { deckFrontmatter, joinDeck, splitDeck } from '#lib/deck-markdown.ts';
import { settingsFrontmatter } from '#lib/deck-settings.ts';
import type { DeckWithSlides, NewDeck } from '#lib/decks.ts';
import { deckFromNote } from '#lib/handoff.ts';

/** What a deck's markdown file is made from: the deck's own fields and its slides' markdown in order. */
export type DeckFile = { title: string; scheme?: string | null; aspect: string; settings?: unknown; slides: string[] };

/** The largest markdown file the library imports, in bytes. */
export const maxImportBytes = 5 * 1024 * 1024;

const markdownExtension = /\.(?:md|markdown)$/i;
const markdownTypes = new Set(['text/markdown', 'text/x-markdown']);
// Characters Windows, macOS or Linux refuse in a file name, and control characters.
// eslint-disable-next-line no-control-regex -- Control characters are what this removes.
const unsafeCharacters = /[<>:"/\\|?*\u{0}-\u{1F}\u{7F}]/gu;
const reservedNames = /^(?:con|prn|aux|nul|com\d|lpt\d)$/i;
const maxNameLength = 120;

/**
 * A deck as one markdown document, the reverse of importing one: its slides joined by `joinDeck`, under TOML
 * frontmatter with its title, scheme, aspect and the settings sld knows.
 */
export function deckMarkdown({ title, scheme, aspect, settings, slides }: DeckFile): string {
	return joinDeck({
		frontmatter: deckFrontmatter({ title, scheme, aspect, ...settingsFrontmatter(settings) }),
		slides
	});
}

/**
 * The name of a deck's markdown file: its title with the characters file systems refuse taken out, cut to a length
 * every file system takes, and `deck` when nothing is left.
 */
export function deckFileName(title: string): string {
	const cleaned = title.replaceAll(unsafeCharacters, ' ').replaceAll(/\s+/g, ' ').trim();
	const cut = [...cleaned].slice(0, maxNameLength).join('');
	const name = cut.replaceAll(/^[\s.]+|[\s.]+$/g, '');
	return `${name === '' || reservedNames.test(name) ? 'deck' : name}.md`;
}

/**
 * The file names for decks with these titles in one folder, in order, each from `deckFileName`. A name taken already,
 * by any case, is numbered from 2: `Talk.md`, `Talk (2).md`.
 */
export function uniqueFileNames(titles: readonly string[]): string[] {
	const taken = new Set<string>();
	return titles.map((title) => {
		const base = deckFileName(title).slice(0, -'.md'.length);
		let name = `${base}.md`;
		for (let number = 2; taken.has(name.toLowerCase()); number++) name = `${base} (${number}).md`;
		taken.add(name.toLowerCase());
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
