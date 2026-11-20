import { describe, expect, it } from 'vitest';
import { isClosing, hunks, lines, parseAnswers, parseFinding, place } from './parse.ts';

describe('lines', () => {
	it('drops line endings and a trailing newline', () => {
		expect(lines('a\r\nb\n')).toEqual(['a', 'b']);
		expect(lines('')).toEqual([]);
		expect(lines('\n')).toEqual(['']);
	});
});

describe('hunks', () => {
	it('gives the new side ranges', () => {
		const patch = '@@ -1,3 +1,4 @@ fn a\n a\n+b\n c\n@@ -20 +21 @@\n-x\n+y\n@@ -30,2 +32,0 @@\n-gone\n-gone';
		expect(hunks(patch)).toEqual([
			{ first: 1, last: 4 },
			{ first: 21, last: 21 }
		]);
		expect(hunks('')).toEqual([]);
	});

	it('skips headers it cannot read', () => {
		expect(hunks('@@ -1 x @@\n@@ -1 +a,2 @@\n@@ -1\n+@@ -1 +1 @@')).toEqual([]);
	});
});

describe('parseFinding', () => {
	it.each([
		[
			'medium · docs/a.md:54 — the doc says Keychain → fix',
			{ lineNo: 0, path: 'docs/a.md', start: 0, line: 54, text: 'medium — the doc says Keychain → fix' }
		],
		[
			'- low · src/a b/x.ts:3-5 — wrong',
			{ lineNo: 0, path: 'src/a b/x.ts', start: 3, line: 5, text: 'low — wrong' }
		],
		[
			'minor, unverified · x.ts:9 — maybe',
			{ lineNo: 0, path: 'x.ts', start: 0, line: 9, text: 'minor, unverified — maybe' }
		],
		['  - high · x.ts:7: no dash', { lineNo: 0, path: 'x.ts', start: 0, line: 7, text: 'high — no dash' }],
		['nit · x.ts:2', { lineNo: 0, path: 'x.ts', start: 0, line: 2, text: 'nit — ' }]
	])('reads %j', (line, want) => {
		expect(parseFinding(0, line)).toEqual(want);
	});

	it.each([
		'Standard pass on abc · model',
		'medium · docs/a.md says the wrong thing',
		'praise · x.ts:3 — nice',
		'low · commit 8a96450 / PR body — names one variable',
		'low · x.ts:5-3 — backwards',
		'low · x.ts:+5 — signed',
		'low · :3 — no path',
		''
	])('finds no place in %j', (line) => {
		expect(parseFinding(0, line)).toBeUndefined();
	});
});

describe('place', () => {
	it('moves findings on the diff out of the body', () => {
		const report =
			'Standard pass on abc · m\n\n- medium · a.ts:3 — on a hunk\n\n- low · a.ts:40 — off it\n- nit · b.ts:2 — no such file\n- low · a.ts:9-11 — spans two hunks';
		const { placed, body } = place(report, [
			{
				name: 'a.ts',
				hunks: [
					{ first: 1, last: 10 },
					{ first: 11, last: 20 }
				]
			}
		]);
		expect(placed).toEqual([{ lineNo: 2, path: 'a.ts', start: 0, line: 3, text: 'medium — on a hunk' }]);
		expect(body).toBe(
			'Standard pass on abc · m\n\n- low · a.ts:40 — off it\n- nit · b.ts:2 — no such file\n- low · a.ts:9-11 — spans two hunks'
		);
	});
});

describe('parseAnswers', () => {
	it('names the comment each answer replies to', () => {
		const { answers, body } = parseAnswers(
			'Answering the review at abc · m\n\n- 123 · Fixed in def.\n456 · Not a defect: the test shows it.\n- x7 · stays'
		);
		expect(answers).toEqual([
			{ comment: '123', text: 'Fixed in def.' },
			{ comment: '456', text: 'Not a defect: the test shows it.' }
		]);
		expect(body).toBe('Answering the review at abc · m\n\n- x7 · stays');
	});

	it('resolves only Fixed and Deferred', () => {
		expect(isClosing('Fixed in def.')).toBe(true);
		expect(isClosing('Deferred to a later issue.')).toBe(true);
		expect(isClosing('Not a defect.')).toBe(false);
		expect(isClosing('fixed')).toBe(false);
	});
});
