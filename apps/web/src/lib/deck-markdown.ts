/** A deck split from its markdown: the raw YAML of the deck's frontmatter, if any, and each slide's markdown. */
export type SplitDeck = { frontmatter: string | undefined; slides: string[] };

type Fence = { marker: '`' | '~'; length: number };

const separator = '---';
const yamlKey = /^[A-Za-z_][\w-]*\s*:(?:\s|$)/;
const fenceOpener = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Splits a deck's markdown into slides. A separator is a line that is exactly `---`, outside fenced code, after a
 * blank line, another separator or the start of the document; a `---` right under text is a setext heading. A YAML
 * block at the top is the deck's frontmatter. A YAML block right after a separator is the slide's frontmatter and
 * stays in the slide's markdown. Slides lose leading and trailing blank lines, and empty slides at either end are
 * dropped.
 */
export function splitDeck(markdown: string): SplitDeck {
	const lines = markdown.replaceAll(/\r\n?/g, '\n').split('\n');
	let frontmatter: string | undefined;
	let start = 0;
	if (lines[0] === separator) {
		const end = yamlBlockEnd(lines, 1);
		if (end !== undefined) {
			frontmatter = lines.slice(1, end).join('\n');
			start = end + 1;
		}
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
		} else if (line === separator && canSeparate) {
			slides.push(trimBlankLines(current));
			const end = yamlBlockEnd(lines, index + 1);
			if (end === undefined) {
				current = [];
			} else {
				current = lines.slice(index, end + 1);
				index = end;
			}
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
 * Joins a split deck back into one markdown document, the reverse of `splitDeck`. The result is normalized: LF line
 * endings, one blank line around each separator, and a single trailing newline.
 */
export function joinDeck({ frontmatter, slides }: SplitDeck): string {
	const blocks: string[] = [];
	if (frontmatter !== undefined) blocks.push(`${separator}\n${frontmatter}\n${separator}`);
	for (const [index, slide] of slides.entries()) {
		const hasOwnSeparator = hasFrontmatter(slide);
		// The first slide needs no separator, unless its frontmatter would read as the deck's.
		const requiresSeparator = index === 0 ? hasOwnSeparator && frontmatter === undefined : !hasOwnSeparator;
		if (requiresSeparator) blocks.push(separator);
		if (slide !== '') blocks.push(slide);
	}
	return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}

function hasFrontmatter(slide: string): boolean {
	const lines = slide.split('\n');
	return lines[0] === separator && yamlBlockEnd(lines, 1) !== undefined;
}

/**
 * The index of the `---` that closes a YAML block starting at `start`, or undefined when the lines there are not one.
 * This reads YAML's shape, not its grammar: the block opens with a `key:` line, holds only keys, indented lines, list
 * items, comments and blank lines, and is closed.
 */
function yamlBlockEnd(lines: string[], start: number): number | undefined {
	if (!yamlKey.test(lines[start] ?? '')) return undefined;
	for (let index = start + 1; index < lines.length; index++) {
		const line = lines[index];
		if (line === separator) return index;
		if (!isYamlLine(line)) return undefined;
	}
	return undefined;
}

function isYamlLine(line: string): boolean {
	return (
		line.trim() === '' ||
		/^\s/.test(line) ||
		line.startsWith('#') ||
		line === '-' ||
		line.startsWith('- ') ||
		yamlKey.test(line)
	);
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
