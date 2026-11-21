/** A run of lines, 1-based and inclusive at both ends. */
export type LineRange = { from: number; to: number };

const group = /(?:^|\s)\{([^{}]*)\}(?=\s|$)/;
const piece = /^(\d+)(?:\s*-\s*(\d+))?$/;

/**
 * The lines a fence's info string asks to highlight, from the first `{...}` group after the language: `{2,4-6}` gives
 * lines 2 and 4 to 6. A range written backward is read forward, line 0 is dropped, and a piece that isn't a line or a range is skipped.
 */
export function lineHighlights(meta: string | undefined): LineRange[] {
	const match = meta?.match(group);
	if (!match) return [];
	const ranges: LineRange[] = [];
	const parts = match[1].split(',');
	for (const part of parts) {
		const numbers = part.trim().match(piece);
		if (!numbers) continue;
		const first = Number(numbers[1]);
		const last = numbers[2] === undefined ? first : Number(numbers[2]);
		const to = Math.max(first, last);
		if (to >= 1) ranges.push({ from: Math.max(1, Math.min(first, last)), to });
	}
	return ranges;
}

/** Whether `line`, 1-based, falls in any of `ranges`. */
export function isHighlighted(ranges: readonly LineRange[], line: number): boolean {
	return ranges.some(({ from, to }) => line >= from && line <= to);
}
