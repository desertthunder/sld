/** How much of a line `plainInline` reads, so a long line costs no more than a short one. */
export const plainInlineLimit = 200;

const asciiPunctuation = /[!-/:-@[-`{-~]/;
// Escaped characters, code spans and autolinks stand in the text as a marker and an index while the rest is stripped,
// so no rule below can read them as markup.
const marker = '';
const reserved = /[-]/g;
const placeholder = /([-])/g;

const image = /!\[([^[\]]*)\]\([^()]*\)/g;
const link = /\[([^[\]]*)\](?:\([^()]*\)|\[[^[\]]*\])/g;
const autolink = /<([a-zA-Z][a-zA-Z\d+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>@]+)>/g;
const htmlTag = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z\d-]*(?:\s[^<>]*)?\/?>/g;
const strong = /(\*\*|\*)([^*\s](?:[^*]*[^*\s])?)\1/g;
// An underscore inside a word, as in `my_file_name`, opens and closes nothing.
const underline = /(?<![\p{L}\p{N}_])(__|_)([^_\s](?:[^_]*[^_\s])?)\1(?![\p{L}\p{N}_])/gu;
const strikethrough = /(~~?)([^~\s](?:[^~]*[^~\s])?)\1/g;

/**
 * The plain text of one line of inline markdown: code spans, links and images keep their text, emphasis and
 * strikethrough lose their delimiters, escapes lose their backslash and inline HTML tags are dropped. Reads at most
 * `plainInlineLimit` characters.
 */
export function plainInline(markdown: string): string {
	const text = [...markdown.replaceAll(reserved, '')].slice(0, plainInlineLimit).join('');
	const literals: string[] = [];
	const keep = (literal: string): string => {
		literals.push(literal);
		return marker + String.fromCodePoint(0xe1_00 + literals.length - 1);
	};

	const restore = (value: string): string =>
		value.replaceAll(placeholder, (_match, slot: string) => literals[slot.codePointAt(0)! - 0xe1_00]!);

	let protectedText = '';
	let index = 0;
	while (index < text.length) {
		const character = text[index]!;
		if (character === '\\' && asciiPunctuation.test(text[index + 1] ?? '')) {
			protectedText += keep(text[index + 1]!);
			index += 2;
			continue;
		}
		if (character === '`') {
			let end = index;
			while (text[end] === '`') end++;
			const run = end - index;
			const close = closingRun(text, end, run);
			if (close === undefined) {
				protectedText += keep(text.slice(index, end));
				index = end;
			} else {
				protectedText += keep(codeSpan(text.slice(end, close)));
				index = close + run;
			}
			continue;
		}
		protectedText += character;
		index++;
	}

	let stripped = protectedText
		.replaceAll(autolink, (_match, target: string) => keep(restore(target)))
		.replaceAll(htmlTag, '')
		.replaceAll(image, '$1')
		.replaceAll(link, '$1');
	for (let previous = ''; previous !== stripped;) {
		previous = stripped;
		stripped = stripped.replaceAll(strong, '$2').replaceAll(underline, '$2').replaceAll(strikethrough, '$2');
	}
	return restore(stripped).replaceAll(/\s+/g, ' ').trim();
}

/** Where the next run of exactly `length` backticks after `from` starts, if there is one. */
function closingRun(text: string, from: number, length: number): number | undefined {
	let index = from;
	while (index < text.length) {
		if (text[index] !== '`') {
			index++;
			continue;
		}
		let end = index;
		while (text[end] === '`') end++;
		if (end - index === length) return index;
		index = end;
	}
	return undefined;
}

function codeSpan(content: string): string {
	return /^ .*[^ ].* $/.test(content) ? content.slice(1, -1) : content;
}
