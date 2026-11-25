/** What a slide with no text is called in the slide list. */
export const untitledSlide = 'Untitled slide';

const fenceOpener = /^ {0,3}(`{3,}|~{3,})/;
const atxHeading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const setextUnderline = /^ {0,3}(?:=+|-+)[ \t]*$/;
const thematicBreak = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const containerMarker = /^ {0,3}(?:>[ \t]?|(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$))+/;
const frontmatterDelimiters = new Set(['---', '+++']);

// The list shows one line, and stripping marks takes time that grows faster than the line, so a label reads only
// this much of it.
const labelLength = 200;

/** Drops the inline markdown a label shouldn't show: emphasis and code marks, link targets and image syntax. */
function plainText(text: string): string {
	return (
		text
			.slice(0, labelLength)
			.replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replaceAll(/(\*{1,3}|`+|~~)(\S(?:.*?\S)?)\1/g, '$2')
			// An underscore inside a word, as in `snake_case`, marks no emphasis.
			.replaceAll(/(?<![\p{L}\p{N}])(_{1,3})(\S(?:.*?\S)?)\1(?![\p{L}\p{N}])/gu, '$2')
			.replaceAll(/\s+/g, ' ')
			.trim()
	);
}

/** The line after a frontmatter block on the first line, or 0 when the slide doesn't open with one. */
function bodyStart(lines: readonly string[]): number {
	const delimiter = lines[0]?.trim();
	if (!delimiter || !frontmatterDelimiters.has(delimiter)) return 0;
	const end = lines.findIndex((line, index) => index > 0 && line.trim() === delimiter);
	return end === -1 ? 0 : end + 1;
}

/** A slide's first heading outside fenced code and frontmatter, and its first line with text. */
function labelParts(markdown: string): { heading?: string; firstLine?: string } {
	const lines = markdown.replaceAll(/\r\n?/g, '\n').split('\n');
	let firstLine: string | undefined;
	let fence: string | undefined;
	let previous: string | undefined;
	for (let index = bodyStart(lines); index < lines.length; index++) {
		const line = lines[index]!;
		const opener = fenceOpener.exec(line)?.[1];
		if (fence) {
			if (opener && opener[0] === fence[0] && opener.length >= fence.length && line.trim() === opener) {
				fence = undefined;
			}
			previous = undefined;
			continue;
		}
		if (opener) {
			fence = opener;
			previous = undefined;
			continue;
		}
		const heading = atxHeading.exec(line);
		if (heading) {
			const text = plainText(heading[1] ?? '');
			if (text) return { heading: text };
			previous = undefined;
			continue;
		}
		if (previous !== undefined && setextUnderline.test(line)) return { heading: previous };
		if (thematicBreak.test(line)) {
			previous = undefined;
			continue;
		}
		const marker = containerMarker.exec(line)?.[0];
		const text = plainText(marker ? line.slice(marker.length) : line);
		if (text && firstLine === undefined) firstLine = text;
		previous = marker ? undefined : text || undefined;
	}
	return { firstLine };
}

/**
 * What the slide list calls a slide: the text of its first heading outside fenced code and frontmatter, failing that
 * its first line with text, failing that `Untitled slide`.
 */
export function slideLabel(markdown: string): string {
	const { heading, firstLine } = labelParts(markdown);
	return heading ?? firstLine ?? untitledSlide;
}

/** The text of a slide's first heading outside fenced code and frontmatter, if it has one. */
export function slideHeading(markdown: string): string | undefined {
	return labelParts(markdown).heading;
}
