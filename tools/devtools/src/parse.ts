/**
 * Turns review reports and revise answers into the parts of a GitHub review
 * that desertthunder-bot posts. Ported from Reseed's `devtools`, which ported Field Atlas's `botcomment` package.
 *
 * A review report is text whose finding lines name a place, such as
 * `medium · apps/web/src/lib/split.ts:12 — a fence hides the separator`.
 * Findings inside the pull request's diff are placed on their lines; every
 * other line becomes the review's body.
 *
 * Revise answers are text whose lines name the review comment that opened a
 * thread, such as `4472234324 · Fixed in 2eadf16: removed the files`. Each
 * becomes a reply on that thread; an answer starting with `Fixed` or
 * `Deferred` resolves it. One review is one notification, however many
 * findings or answers it holds.
 */

/** Severities a finding line opens with. */
const severities = new Set(['blocker', 'high', 'major', 'medium', 'minor', 'low', 'nit']);

/** Outcomes that close a thread. A finding declined as not a defect stays open for Owais to judge. */
const closing = ['Fixed', 'Deferred'];

/** The first and last new-side line of a patch hunk. */
export type Hunk = { first: number; last: number };

/** A changed file's name and the new-side ranges of its hunks. */
export type ChangedFile = { name: string; hunks: Hunk[] };

/** A report line that names a place in a file. */
export type Finding = {
	lineNo: number;
	path: string;
	/** First line of a range; 0 when the finding names one line. */
	start: number;
	line: number;
	/** The severity, then the finding after its place. */
	text: string;
};

/** A reply to the review thread whose first comment is `comment`. */
export type Answer = { comment: string; text: string };

/** Splits text into lines without their endings, with no empty last line for a trailing newline. */
export function lines(text: string): string[] {
	if (text === '') return [];
	const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
	return trimmed.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** Splits `text` at the first `separator`, like Go's `strings.Cut`. */
function cut(text: string, separator: string): [string, string] | undefined {
	const index = text.indexOf(separator);
	return index === -1 ? undefined : [text.slice(0, index), text.slice(index + separator.length)];
}

/** Reads a whole number written in digits only. */
function wholeNumber(text: string): number | undefined {
	return /^\d+$/.test(text) ? Number(text) : undefined;
}

/** Strips the leading characters that are in `characters`. */
function trimStart(text: string, characters: string): string {
	let index = 0;
	while (index < text.length && characters.includes(text[index])) index++;
	return text.slice(index);
}

/** Strips the trailing characters that are in `characters`. */
function trimEnd(text: string, characters: string): string {
	let end = text.length;
	while (end > 0 && characters.includes(text[end - 1])) end--;
	return text.slice(0, end);
}

/** Returns the new-side line ranges of a file's patch hunks. */
export function hunks(patch: string): Hunk[] {
	const found: Hunk[] = [];
	for (const line of lines(patch)) {
		if (!line.startsWith('@@ -')) continue;
		const fields = line.slice(4).split(' ');
		if (fields.length < 2 || !fields[1].startsWith('+')) continue;
		const [startText, countText] = fields[1].slice(1).split(',', 2);
		const start = wholeNumber(startText);
		const count = countText === undefined ? 1 : wholeNumber(countText);
		if (start === undefined || count === undefined) continue;
		if (count > 0) found.push({ first: start, last: start + count - 1 });
	}
	return found;
}

/**
 * Reads a report line as a finding with a place, such as `medium · a.ts:12 — ...`
 * or `- low · a.ts:3-5 — ...`, or returns undefined.
 */
export function parseFinding(lineNo: number, line: string): Finding | undefined {
	let rest = trimStart(line, ' \t');
	if (rest.startsWith('- ')) rest = rest.slice(2);
	// The severity may carry a mark after it, as in `minor, unverified`.
	const severityCut = cut(rest, ' · ');
	if (!severityCut) return undefined;
	const [severity, afterSeverity] = severityCut;
	const word = severity.split(/[ ,]+/).find((part) => part !== '');
	if (word === undefined || !severities.has(word)) return undefined;
	// The place runs to the dash before the problem, or else to the first
	// space, so a path with a space in it needs the dash.
	let [place, text] = cut(afterSeverity, ' — ') ?? cut(afterSeverity, ' ') ?? [afterSeverity, ''];
	place = trimEnd(place.trim(), ':,');
	const colon = place.lastIndexOf(':');
	if (colon === -1) return undefined;
	const path = place.slice(0, colon);
	const span = place.slice(colon + 1);
	let start = 0;
	let end: number | undefined;
	const range = cut(span, '-');
	if (range) {
		const first = wholeNumber(range[0]);
		end = wholeNumber(range[1]);
		if (first === undefined || end === undefined || first >= end) return undefined;
		start = first;
	} else {
		end = wholeNumber(span);
		if (end === undefined) return undefined;
	}
	if (path === '') return undefined;
	text = trimStart(trimStart(trimStart(text, ' \t'), '—-:'), ' \t');
	return { lineNo, path, start, line: end, text: `${severity} — ${text}` };
}

function isOnDiff(finding: Finding, files: ChangedFile[]): boolean {
	const first = finding.start === 0 ? finding.line : finding.start;
	const file = files.find((candidate) => candidate.name === finding.path);
	return file?.hunks.some((hunk) => hunk.first <= first && finding.line <= hunk.last) ?? false;
}

/**
 * Splits a report into the findings that sit on the diff, each inside one hunk
 * of its file, and the review body: every other line.
 */
export function place(report: string, files: ChangedFile[]): { placed: Finding[]; body: string } {
	const placed: Finding[] = [];
	const body: string[] = [];
	for (const [lineNo, line] of lines(report).entries()) {
		const finding = parseFinding(lineNo, line);
		if (finding && isOnDiff(finding, files)) {
			placed.push(finding);
			continue;
		}
		// A finding moved inline leaves no run of blank lines behind.
		if (line.trim() === '' && body.length > 0 && body.at(-1)?.trim() === '') continue;
		body.push(line);
	}
	return { placed, body: body.join('\n').trim() };
}

/**
 * Splits answers into those naming a review comment, as `<id> · <outcome>` or
 * `- <id> · <outcome>`, and the review body: every other line.
 */
export function parseAnswers(text: string): { answers: Answer[]; body: string } {
	const answers: Answer[] = [];
	const body: string[] = [];
	for (const line of lines(text)) {
		let rest = trimStart(line, ' \t');
		if (rest.startsWith('- ')) rest = rest.slice(2);
		const parts = cut(rest, ' · ');
		if (parts && /^\d+$/.test(parts[0])) {
			answers.push({ comment: parts[0], text: parts[1].trim() });
			continue;
		}
		body.push(line);
	}
	return { answers, body: body.join('\n').trim() };
}

/** Reports whether an answer resolves its thread. */
export function isClosing(text: string): boolean {
	return closing.some((outcome) => text.startsWith(outcome));
}
