import { slideParts } from '#lib/deck-markdown.ts';
import { slideHeading } from '#lib/slide-label.ts';

/** One block of a slide as an index card writes it: a paragraph, a list item after its marker, or a line of code. */
export type CardLine = { kind: 'text' | 'item' | 'code'; text: string; marker?: string };

/** What an index card shows of a slide: its heading in the band above the rule, and its blocks on the ruled lines. */
export type CardText = { title: string; lines: CardLine[] };

const headings = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
// A card has no room for these, so they drop out rather than leave a gap on the lines.
const dropped = new Set(['TABLE', 'HR', 'IMG', 'IFRAME', 'VIDEO', 'AUDIO', 'SCRIPT', 'STYLE', 'SECTION']);
const containers = new Set(['BLOCKQUOTE', 'DIV', 'DETAILS']);
// A slide shows none of their text, though `textContent` holds it.
const unseen = 'script, style, noscript, template, svg, [hidden]';
// The most lines any card writes, and one more so the last ends in an ellipsis. Blocks past it would only be clipped.
const maxLines = 7;

/** The text a slide shows of an element, its runs of whitespace collapsed to single spaces, leaving out `skip`. */
function textOf(element: Element, skip = unseen): string {
	const copy = element.cloneNode(true) as Element;
	for (const part of copy.querySelectorAll(skip)) part.remove();
	return copy.textContent.replaceAll(/\s+/g, ' ').trim();
}

/** A list's first number, from its `start` as a browser reads it. */
function listStart(list: Element): number {
	const start = Math.trunc(Number(list.getAttribute('start') ?? 1));
	return Number.isSafeInteger(start) ? start : 1;
}

function listLines(list: Element): CardLine[] {
	const lines: CardLine[] = [];
	const start = listStart(list);
	const items = [...list.children].filter((child) => child.tagName === 'LI');
	for (const [index, item] of items.entries()) {
		// Nested lists take lines of their own.
		const text = textOf(item, `${unseen}, ul, ol`);
		const marker = list.tagName === 'OL' ? `${start + index}.` : '•';
		if (text) lines.push({ kind: 'item', text, marker });
		for (const nested of item.querySelectorAll(':scope > ul, :scope > ol')) lines.push(...listLines(nested));
	}
	return lines;
}

function blockLines(block: Element): CardLine[] {
	if (dropped.has(block.tagName) || block.matches(unseen)) return [];
	if (block.tagName === 'UL' || block.tagName === 'OL') return listLines(block);
	if (block.tagName === 'PRE') {
		const first = block.textContent.split('\n').find((line) => line.trim());
		return first ? [{ kind: 'code', text: first.trim() }] : [];
	}
	if (containers.has(block.tagName)) {
		const children = [...block.children];
		if (children.length > 0) return children.flatMap((child) => blockLines(child));
	}
	const text = textOf(block);
	return text ? [{ kind: 'text', text }] : [];
}

/**
 * What an index card shows of a slide drawn as `html`: its first heading as the title, and each other block as a line
 * of text that may wrap onto the next ruled line. List items keep a marker, a code block keeps its first line, and
 * images, tables and rules drop out. The HTML is parsed in a template, whose content loads nothing.
 */
export function cardText(html: string): CardText {
	const template = document.createElement('template');
	template.innerHTML = html;
	const blocks = [...template.content.children];
	const heading = blocks.find((block) => headings.has(block.tagName) && textOf(block));
	const lines: CardLine[] = [];
	for (const block of blocks) {
		if (lines.length >= maxLines) break;
		if (block !== heading) lines.push(...blockLines(block));
	}
	return { title: heading ? textOf(heading) : '', lines: lines.slice(0, maxLines) };
}

/**
 * What an index card shows before the slide is drawn, or when it can't be: the slide's first heading in the band, as
 * the slide list reads it, and the rest of its markdown as typed on the lines.
 */
export function placeholderCard(markdown: string): CardText {
	const slide = markdown.replaceAll(/\r\n?/g, '\n');
	const heading = slideHeading(slide);
	const source = slide.split('\n');
	const bodyStart = source.length - slideParts(slide).body.split('\n').length;
	const lines = source
		.map((line, index) => ({ line: line.trim(), index }))
		.filter(
			({ line, index }) =>
				index >= bodyStart && line && !(heading && index >= heading.start && index <= heading.end)
		)
		.slice(0, maxLines)
		.map(({ line }): CardLine => ({ kind: 'text', text: line }));
	return { title: heading?.text ?? '', lines };
}
