import { slideParts } from '#lib/deck-markdown.ts';

/** A raw HTML node in a slide's markdown: where its source starts and ends, and the HTML it passes through. */
export type RawHtml = { start: number; end: number; value: string };

/** What a check makes of one raw HTML node: safe as it is, or safe only as `replacement`. */
export type HtmlVerdict = { isSafe: true } | { isSafe: false; replacement: string };

/** The parts `cleanRawHtml` works with: a markdown parser that finds raw HTML, and a check for each node it finds. */
export type HtmlCleaner = { find: (markdown: string) => RawHtml[]; check: (html: string) => HtmlVerdict };

// Replacing a node can change how the markdown around it parses, so the result is checked again, and after this many
// passes what is still unsafe is escaped into text.
const replacingPasses = 2;
const maxPasses = 4;

/**
 * A slide's markdown with each raw HTML node, block or inline, that `check` finds unsafe replaced by its safe form, and
 * everything else, code spans and fenced code included, left byte for byte. The slide's frontmatter is left alone.
 * Throws when the HTML can't be made safe, which a correct check never leaves.
 */
export function cleanRawHtml(slide: string, { find, check }: HtmlCleaner): string {
	const { body: original } = slideParts(slide);
	const head = slide.slice(0, slide.length - original.length);
	let body = original;
	for (let pass = 0; pass < maxPasses; pass++) {
		const unsafe: (RawHtml & { replacement: string })[] = [];
		for (const node of find(body)) {
			const verdict = check(node.value);
			if (!verdict.isSafe) unsafe.push({ ...node, replacement: verdict.replacement });
		}
		if (unsafe.length === 0) return head + body;
		unsafe.sort((a, b) => a.start - b.start);
		let next = '';
		let at = 0;
		for (const { start, end, value, replacement } of unsafe) {
			const source = body.slice(start, end);
			next += body.slice(at, start);
			next += pass < replacingPasses ? inPlace(replacement, source, value) : source.replaceAll('<', '&lt;');
			at = end;
		}
		body = next + body.slice(at);
	}
	throw new Error("The slide's HTML couldn't be made safe");
}

/**
 * `replacement` written where `source` was. A node inside a blockquote or list has markers or indentation on each line
 * after its first that its HTML leaves out, so those lines of the replacement take the same prefix.
 */
function inPlace(replacement: string, source: string, value: string): string {
	if (source === value || !replacement.includes('\n')) return replacement;
	const sourceLines = source.split('\n');
	const valueLines = value.split('\n');
	const second = sourceLines[1] ?? '';
	const prefix = second.endsWith(valueLines[1] ?? '')
		? second.slice(0, second.length - (valueLines[1] ?? '').length)
		: '';
	return replacement.split('\n').join(`\n${prefix}`);
}
