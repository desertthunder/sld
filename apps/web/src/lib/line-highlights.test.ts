import { describe, expect, it } from 'vitest';
import { isHighlighted, lineHighlights } from '#lib/line-highlights.ts';

describe('lineHighlights', () => {
	it('reads single lines and ranges from the first brace group', () => {
		expect(lineHighlights('{2,4-6}')).toEqual([
			{ from: 2, to: 2 },
			{ from: 4, to: 6 }
		]);
		expect(lineHighlights('title="a.ts" { 1 , 3 - 4 } {9}')).toEqual([
			{ from: 1, to: 1 },
			{ from: 3, to: 4 }
		]);
	});

	it('reads a backward range forward and drops line 0', () => {
		expect(lineHighlights('{6-4}')).toEqual([{ from: 4, to: 6 }]);
		expect(lineHighlights('{0,0-2}')).toEqual([{ from: 1, to: 2 }]);
	});

	it('skips pieces that are not a line or a range', () => {
		expect(lineHighlights('{2,x,4-,-1,3.5,7}')).toEqual([
			{ from: 2, to: 2 },
			{ from: 7, to: 7 }
		]);
	});

	it('finds nothing without a brace group standing on its own', () => {
		for (const meta of [undefined, '', 'title="x"', '{}', 'a{2}', '{2}b', '{2']) {
			expect(lineHighlights(meta), String(meta)).toEqual([]);
		}
	});
});

describe('isHighlighted', () => {
	it('is true for a line inside any range, ends included', () => {
		const ranges = lineHighlights('{2,4-6}');
		expect([1, 2, 3, 4, 5, 6, 7].map((line) => isHighlighted(ranges, line))).toEqual([
			false,
			true,
			false,
			true,
			true,
			true,
			false
		]);
	});
});
