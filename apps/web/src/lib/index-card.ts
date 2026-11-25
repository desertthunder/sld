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

/** Text with its runs of whitespace collapsed to single spaces. */
function flat(text: string | null | undefined): string {
	return text?.replaceAll(/\s+/g, ' ').trim() ?? '';
}

/** An element's text, leaving out its nested lists, whose items take lines of their own. */
function ownText(element: Element): string {
	const copy = element.cloneNode(true) as Element;
	for (const list of copy.querySelectorAll('ul, ol')) list.remove();
	return flat(copy.textContent);
}

function listLines(list: Element): CardLine[] {
	const lines: CardLine[] = [];
	const start = Number(list.getAttribute('start') ?? 1);
	const items = [...list.children].filter((child) => child.tagName === 'LI');
	for (const [index, item] of items.entries()) {
		const text = ownText(item);
		const marker = list.tagName === 'OL' ? `${start + index}.` : '•';
		if (text) lines.push({ kind: 'item', text, marker });
		for (const nested of item.querySelectorAll(':scope > ul, :scope > ol')) lines.push(...listLines(nested));
	}
	return lines;
}

function blockLines(block: Element): CardLine[] {
	if (dropped.has(block.tagName)) return [];
	if (block.tagName === 'UL' || block.tagName === 'OL') return listLines(block);
	if (block.tagName === 'PRE') {
		const first = (block.textContent ?? '').split('\n').find((line) => line.trim());
		return first ? [{ kind: 'code', text: first.trim() }] : [];
	}
	if (containers.has(block.tagName)) {
		const children = [...block.children];
		if (children.length > 0) return children.flatMap((child) => blockLines(child));
	}
	const text = flat(block.textContent);
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
	const heading = blocks.find((block) => headings.has(block.tagName) && flat(block.textContent));
	const lines = blocks.filter((block) => block !== heading).flatMap((block) => blockLines(block));
	return { title: flat(heading?.textContent), lines };
}

/**
 * What an index card shows before the slide is drawn, or when it can't be: the slide's first heading in the band, as
 * the slide list reads it, and the rest of its markdown as typed on the lines.
 */
export function placeholderCard(markdown: string): CardText {
	const title = slideHeading(markdown) ?? '';
	const source = slideParts(markdown).body.split('\n');
	const headingLine = title ? source.findIndex((line) => slideHeading(line) === title) : -1;
	const lines = source
		.filter((line, index) => index !== headingLine && line.trim())
		.map((line): CardLine => ({ kind: 'text', text: line.trim() }));
	return { title, lines };
}
