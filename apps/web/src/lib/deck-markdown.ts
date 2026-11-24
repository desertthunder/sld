import { parse as parseToml, stringify as stringifyToml, TomlError } from 'smol-toml';
import { parseDocument } from 'yaml';
import { errorText } from '#lib/error-text.ts';

/** The language of a frontmatter block: YAML between `---` lines or TOML between `+++` lines. */
export type FrontmatterFormat = 'yaml' | 'toml';

/** A frontmatter block: its text between the delimiter lines, its language, and every field it parses to. */
export type Frontmatter = { format: FrontmatterFormat; raw: string; data: Record<string, unknown> };

/**
 * Why a block shaped as frontmatter doesn't parse: its language, the parser's message, and the line of the slide the
 * parser points at, counted from 1, where the block's opening delimiter is line 1. A parser that names no line points
 * at the opening delimiter.
 */
export type FrontmatterError = { format: FrontmatterFormat; message: string; line: number };

/** A deck's frontmatter, with the fields sld reads typed where they hold a string. Every field stays in `data`. */
export type DeckFrontmatter = Frontmatter & { title?: string; scheme?: string; aspect?: string };

/** A deck split from its markdown: the deck's frontmatter, if any, and each slide's markdown. */
export type SplitDeck = { frontmatter: DeckFrontmatter | undefined; slides: string[] };

type Fence = { marker: '`' | '~'; length: number };

const separator = '---';
const delimiters: Record<FrontmatterFormat, string> = { yaml: '---', toml: '+++' };
// A YAML block opens with a key, so a heading or a comment above `key: value` prose keeps it slide text.
const firstLines: Record<FrontmatterFormat, RegExp> = { yaml: /^[A-Za-z_][\w-]*\s*:(?:\s|$)/, toml: /^[^\s#]/ };
const fenceOpener = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const atxHeading = /^ {0,3}#{1,6}(?:\s|$)/;
const thematicBreak = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const setextUnderline = /^ {0,3}(?:=+|-+)[ \t]*$/;
// A list item or blockquote with text carries the lines after it until a blank line. Under paragraph text only a
// blockquote, a bullet item or an item numbered 1 can start one; with no text it holds no paragraph to continue.
const containerStart = /^ {0,3}(?:>[ \t]*\S|[-+*][ \t]+\S|\d{1,9}[.)][ \t]+\S)/;
const interruptingContainer = /^ {0,3}(?:>[ \t]*\S|[-+*][ \t]+\S|1[.)][ \t]+\S)/;
const emptyContainer = /^ {0,3}(?:>|[-+*]|\d{1,9}[.)])[ \t]*$/;

/**
 * Splits a deck's markdown into slides. A separator is a line that is exactly `---`, outside fenced code, that can't
 * underline a setext heading: one after a blank line, a heading, a thematic break, a closing fence, a list item or
 * blockquote line, another separator, a frontmatter block or the start of the document. A `---` right under paragraph
 * text is a setext heading.
 *
 * A frontmatter block is YAML between `---` lines or TOML between `+++` lines that opens with a key and parses as a
 * mapping; a block that doesn't parse is slide text, and a `---` after a blank line closes no YAML block, since it is
 * a separator. A block on the first line is the deck's frontmatter. A YAML
 * block whose opening `---` is a separator, or a TOML block on a slide's first line, is the slide's frontmatter and
 * stays in the slide's markdown. Slides lose leading and trailing blank lines, and empty slides at either end are
 * dropped.
 */
export function splitDeck(markdown: string): SplitDeck {
	const lines = markdown
		.replace(/^\u{FEFF}/u, '')
		.replaceAll(/\r\n?/g, '\n')
		.split('\n');
	let frontmatter: DeckFrontmatter | undefined;
	let start = 0;
	const top = blockAt(lines, 0);
	if (top) {
		frontmatter = withDeckFields(top.frontmatter);
		start = top.end + 1;
	}

	const slides: string[] = [];
	let current: string[] = [];
	let fence: Fence | undefined;
	let canSeparate = true;
	let isInContainer = false;
	for (let index = start; index < lines.length; index++) {
		const line = lines[index];
		if (fence) {
			current.push(line);
			if (isFenceClose(fence, line)) fence = undefined;
			canSeparate = fence === undefined;
			continue;
		}
		const block = blockAt(lines, index);
		if (line === separator && canSeparate) {
			isInContainer = false;
			slides.push(trimBlankLines(current));
			if (block?.frontmatter.format === 'yaml') {
				current = lines.slice(index, block.end + 1);
				index = block.end;
			} else {
				current = [];
			}
		} else if (block?.frontmatter.format === 'toml' && current.every((row) => row.trim() === '')) {
			current = lines.slice(index, block.end + 1);
			index = block.end;
			canSeparate = true;
			isInContainer = false;
		} else {
			fence = openFence(line);
			current.push(line);
			const isBlank = line.trim() === '';
			if (isBlank) isInContainer = false;
			else if (!thematicBreak.test(line) && (canSeparate ? containerStart : interruptingContainer).test(line)) {
				isInContainer = true;
			}
			canSeparate =
				fence === undefined &&
				(isBlank ||
					isInContainer ||
					atxHeading.test(line) ||
					thematicBreak.test(line) ||
					(canSeparate ? emptyContainer : setextUnderline).test(line));
		}
	}
	slides.push(trimBlankLines(current));

	while (slides[0] === '') slides.shift();
	while (slides.at(-1) === '') slides.pop();
	return { frontmatter, slides };
}

/**
 * Joins a split deck back into one markdown document, the reverse of `splitDeck`. Each frontmatter block keeps the
 * language it came in. The result is normalized: LF line endings, one blank line around each separator except
 * before a slide's TOML block, and a single trailing newline.
 */
export function joinDeck({
	frontmatter,
	slides
}: {
	frontmatter: Pick<Frontmatter, 'format' | 'raw'> | undefined;
	slides: string[];
}): string {
	const blocks: string[] = [];
	if (frontmatter !== undefined) {
		const delimiter = delimiters[frontmatter.format];
		blocks.push(`${delimiter}\n${frontmatter.raw}\n${delimiter}`);
	}
	for (const [index, slide] of slides.entries()) {
		const format = slideFrontmatter(slide)?.format;
		// The first slide needs no separator, unless its frontmatter would read as the deck's.
		const requiresSeparator = index === 0 ? format !== undefined && frontmatter === undefined : format !== 'yaml';
		if (requiresSeparator && format === 'toml') {
			blocks.push(`${separator}\n${slide}`);
		} else {
			if (requiresSeparator) blocks.push(separator);
			if (slide !== '') blocks.push(slide);
		}
	}
	return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}

/** The frontmatter block a slide's markdown opens with, YAML or TOML, or undefined when it has none. */
export function slideFrontmatter(slide: string): Frontmatter | undefined {
	return slideParts(slide).frontmatter;
}

/** A slide's frontmatter block, as `slideFrontmatter` reads it, and the markdown after the block. */
export function slideParts(slide: string): { frontmatter: Frontmatter | undefined; body: string } {
	const lines = slide.split('\n');
	const block = blockAt(lines, 0);
	return block
		? { frontmatter: block.frontmatter, body: lines.slice(block.end + 1).join('\n') }
		: { frontmatter: undefined, body: slide };
}

/**
 * Builds deck frontmatter from fields, written as TOML, the form sld prefers. Undefined and null values are left
 * out at every depth, since TOML has no null, and no fields give no frontmatter.
 */
export function deckFrontmatter(fields: Record<string, unknown>): DeckFrontmatter | undefined {
	const defined = withoutNulls(fields) as Record<string, unknown>;
	if (Object.keys(defined).length === 0) return undefined;
	const raw = stringifyToml(defined).trim();
	const parsed = parseMapping('toml', raw);
	return withDeckFields({ format: 'toml', raw, data: 'data' in parsed ? parsed.data : defined });
}

function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null;
}

function withoutNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.filter((item) => isPresent(item)).map((item) => withoutNulls(item));
	if (value === null || typeof value !== 'object') return value;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype
		? Object.fromEntries(
				Object.entries(value)
					.filter(([, item]) => isPresent(item))
					.map(([key, item]) => [key, withoutNulls(item)])
			)
		: value;
}

function withDeckFields(frontmatter: Frontmatter): DeckFrontmatter {
	const deck: DeckFrontmatter = { ...frontmatter };
	for (const key of ['title', 'scheme', 'aspect'] as const) {
		const value = frontmatter.data[key];
		if (typeof value === 'string') deck[key] = value;
	}
	return deck;
}

/**
 * Why the block a slide's markdown opens with doesn't parse, when it is shaped as frontmatter (delimiter lines around
 * text that opens with a key) but isn't a valid mapping. Such a block is slide text, so `slideParts` doesn't return it.
 */
export function slideFrontmatterError(slide: string): FrontmatterError | undefined {
	const candidate = candidateAt(slide.split('\n'), 0);
	if (candidate === undefined) return undefined;
	const parsed = parseMapping(candidate.format, candidate.raw);
	if (!('error' in parsed)) return undefined;
	// The block's text starts on the line after its opening delimiter.
	const line = parsed.line === undefined ? 1 : Math.min(parsed.line, candidate.end) + 1;
	return { format: candidate.format, message: parsed.error, line };
}

/** The delimited text at `start` that could be a frontmatter block, before it is parsed. */
function candidateAt(
	lines: string[],
	start: number
): { format: FrontmatterFormat; raw: string; end: number } | undefined {
	const format = (Object.keys(delimiters) as FrontmatterFormat[]).find((key) => delimiters[key] === lines[start]);
	if (format === undefined || !firstLines[format].test(lines[start + 1] ?? '')) return undefined;
	const end = lines.indexOf(delimiters[format], start + 2);
	return end === -1 || (format === 'yaml' && lines[end - 1].trim() === '')
		? undefined
		: { format, raw: lines.slice(start + 1, end).join('\n'), end };
}

/** The frontmatter block opening at `start` and the index of its closing line, or undefined when there is none. */
function blockAt(lines: string[], start: number): { frontmatter: Frontmatter; end: number } | undefined {
	const candidate = candidateAt(lines, start);
	if (candidate === undefined) return undefined;
	const { format, raw, end } = candidate;
	const parsed = parseMapping(format, raw);
	return 'data' in parsed ? { frontmatter: { format, raw, data: parsed.data }, end } : undefined;
}

/** `raw` parsed as a mapping, or the parser's message and the line of `raw` it points at, counted from 1. */
function parseMapping(
	format: FrontmatterFormat,
	raw: string
): { data: Record<string, unknown> } | { error: string; line?: number } {
	let data: unknown;
	try {
		if (format === 'yaml') {
			// Plain messages, since the parser would count lines from the block's text rather than the slide's.
			const document = parseDocument(raw, { prettyErrors: false });
			if (document.errors.length > 0) {
				const [{ message, pos }] = document.errors;
				return { error: message, line: raw.slice(0, pos[0]).split('\n').length };
			}
			// Throws on an unresolved alias or too many alias expansions, which parsing alone doesn't report.
			data = document.toJS();
		} else {
			data = parseToml(raw);
		}
	} catch (error) {
		// smol-toml's message ends with the lines around the error, numbered from the block's text, after its first line.
		const line = error instanceof TomlError ? error.line : undefined;
		return { error: line === undefined ? errorText(error) : errorText(error).split('\n', 1)[0]!, line };
	}
	return typeof data === 'object' && data !== null && !Array.isArray(data)
		? { data: { ...(data as Record<string, unknown>) } }
		: { error: 'Frontmatter is not a mapping of keys to values' };
}

function openFence(line: string): Fence | undefined {
	const match = fenceOpener.exec(line);
	if (!match) return undefined;
	const [, run, info] = match;
	const marker = run[0] as Fence['marker'];
	return marker === '`' && info.includes('`') ? undefined : { marker, length: run.length };
}

function isFenceClose(fence: Fence, line: string): boolean {
	const match = /^ {0,3}(`+|~+)\s*$/.exec(line);
	return match !== null && match[1][0] === fence.marker && match[1].length >= fence.length;
}

function trimBlankLines(lines: string[]): string {
	let first = 0;
	let last = lines.length;
	while (first < last && lines[first].trim() === '') first++;
	while (last > first && lines[last - 1].trim() === '') last--;
	return lines.slice(first, last).join('\n');
}
