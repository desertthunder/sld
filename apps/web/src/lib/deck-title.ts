import { slideParts, type SplitDeck } from '#lib/deck-markdown.ts';

const fenceOpener = /^ {0,3}(`{3,}|~{3,})/;
const atxHeading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const setextUnderline = /^ {0,3}(?:=+|-+)[ \t]*$/;
const indentedCode = /^(?: {4}|\t)/;
// Lines that start a block of their own, so they neither start nor continue a paragraph a setext underline could make a
// heading.
const otherBlock = /^ {0,3}(?:>|[-+*](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|<|(?:[-*_][ \t]*){3,}$)/;

/** The title of a deck with no frontmatter title and no heading: `Untitled Deck - {YYYY-MM-DD}`, made on `made`. */
export function untitledDeck(made: Date): string {
	const month = String(made.getMonth() + 1).padStart(2, '0');
	const day = String(made.getDate()).padStart(2, '0');
	return `Untitled Deck - ${made.getFullYear()}-${month}-${day}`;
}

/** The text of the first ATX or setext heading in `markdown`, outside fenced and indented code. */
export function firstHeading(markdown: string): string | undefined {
	let fence: { marker: string; length: number } | undefined;
	let paragraph: string[] = [];
	for (const line of markdown.split('\n')) {
		if (fence) {
			const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1];
			if (close?.[0] === fence.marker && close.length >= fence.length) fence = undefined;
			continue;
		}
		const opener = line.match(fenceOpener)?.[1];
		if (opener) {
			fence = { marker: opener[0]!, length: opener.length };
			paragraph = [];
			continue;
		}
		if (paragraph.length > 0 && setextUnderline.test(line)) return paragraph.join(' ');
		const atx = line.match(atxHeading);
		if (atx) {
			if (atx[1]?.trim()) return atx[1].trim();
			paragraph = [];
		} else if (line.trim() === '' || otherBlock.test(line) || (paragraph.length === 0 && indentedCode.test(line))) {
			paragraph = [];
		} else {
			paragraph.push(line.trim());
		}
	}
	return undefined;
}

/**
 * A deck's title: its frontmatter's `title`, else the first heading in its slides, else `untitledDeck` for the day it
 * was `made`, in local time.
 */
export function deckTitle({ frontmatter, slides }: SplitDeck, made: Date = new Date()): string {
	const fromFrontmatter = frontmatter?.title?.trim();
	if (fromFrontmatter) return fromFrontmatter;
	for (const slide of slides) {
		const heading = firstHeading(slideParts(slide).body);
		if (heading !== undefined) return heading;
	}
	return untitledDeck(made);
}
