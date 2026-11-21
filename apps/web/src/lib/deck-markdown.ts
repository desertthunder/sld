import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parseDocument } from 'yaml';

/** The language of a frontmatter block: YAML between `---` lines or TOML between `+++` lines. */
export type FrontmatterFormat = 'yaml' | 'toml';

/** A frontmatter block: its text between the delimiter lines, its language, and every field it parses to. */
export type Frontmatter = { format: FrontmatterFormat; raw: string; data: Record<string, unknown> };

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

/**
 * Splits a deck's markdown into slides. A separator is a line that is exactly `---`, outside fenced code, after a
 * blank line, another separator, a frontmatter block or the start of the document; a `---` right under text is a
 * setext heading.
 *
 * A frontmatter block is YAML between `---` lines or TOML between `+++` lines that opens with a key and parses as a
 * mapping; a block that doesn't parse is slide text. A block on the first line is the deck's frontmatter. A YAML
 * block whose opening `---` is a separator, or a TOML block on a slide's first line, is the slide's frontmatter and
 * stays in the slide's markdown. Slides lose leading and trailing blank lines, and empty slides at either end are
 * dropped.
 */
export function splitDeck(markdown: string): SplitDeck {
	const lines = markdown.replaceAll(/\r\n?/g, '\n').split('\n');
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
	for (let index = start; index < lines.length; index++) {
		const line = lines[index];
		if (fence) {
			current.push(line);
			if (isFenceClose(fence, line)) fence = undefined;
			canSeparate = false;
			continue;
		}
		const block = blockAt(lines, index);
		if (line === separator && canSeparate) {
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
		} else {
			fence = openFence(line);
			current.push(line);
			canSeparate = line.trim() === '';
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
	return blockAt(slide.split('\n'), 0)?.frontmatter;
}

/**
 * Builds deck frontmatter from fields, written as TOML, the form sld prefers. Undefined and null fields are left
 * out, since TOML has no null, and no fields give no frontmatter.
 */
export function deckFrontmatter(fields: Record<string, unknown>): DeckFrontmatter | undefined {
	const defined = Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined && value !== null)
	);
	if (Object.keys(defined).length === 0) return undefined;
	const raw = stringifyToml(defined).trim();
	return withDeckFields({ format: 'toml', raw, data: parseMapping('toml', raw) ?? defined });
}

function withDeckFields(frontmatter: Frontmatter): DeckFrontmatter {
	const deck: DeckFrontmatter = { ...frontmatter };
	for (const key of ['title', 'scheme', 'aspect'] as const) {
		const value = frontmatter.data[key];
		if (typeof value === 'string') deck[key] = value;
	}
	return deck;
}

/** The frontmatter block opening at `start` and the index of its closing line, or undefined when there is none. */
function blockAt(lines: string[], start: number): { frontmatter: Frontmatter; end: number } | undefined {
	const format = (Object.keys(delimiters) as FrontmatterFormat[]).find((key) => delimiters[key] === lines[start]);
	if (format === undefined || !firstLines[format].test(lines[start + 1] ?? '')) return undefined;
	const end = lines.indexOf(delimiters[format], start + 2);
	if (end === -1) return undefined;
	const raw = lines.slice(start + 1, end).join('\n');
	const data = parseMapping(format, raw);
	return data === undefined ? undefined : { frontmatter: { format, raw, data }, end };
}

function parseMapping(format: FrontmatterFormat, raw: string): Record<string, unknown> | undefined {
	let data: unknown;
	if (format === 'yaml') {
		const document = parseDocument(raw);
		if (document.errors.length > 0) return undefined;
		data = document.toJS();
	} else {
		try {
			data = parseToml(raw);
		} catch {
			return undefined;
		}
	}
	return typeof data === 'object' && data !== null && !Array.isArray(data)
		? { ...(data as Record<string, unknown>) }
		: undefined;
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
