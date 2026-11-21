import { describe, expect, it } from 'vitest';
import { highlightCode, knownLanguage, type Token } from '#lib/code-highlight.ts';

const sample = [
	'// Split a deck on its rules.',
	'import { slideParts } from "#lib/deck-markdown.ts";',
	'',
	'export type Slide = { index: number; markdown: string };',
	'',
	'export function splitDeck(markdown: string, limit = 256): Slide[] {',
	'\tconst rule = /^---$/m;',
	'\treturn markdown.split(rule).map((part, index) => ({ index, markdown: `${part}\\n` }));',
	'}'
].join('\n');

const marked = (lines: Token[][]) =>
	lines.map((tokens) => tokens.map(({ kind, text }) => (kind === 'plain' ? text : `[${kind}:${text}]`)).join(''));

describe('highlightCode', () => {
	it('gives each token of a TypeScript sample its kind', async () => {
		expect(marked((await highlightCode(sample, 'ts'))!)).toMatchInlineSnapshot(`
			[
			  "[comment:// Split a deck on its rules.]",
			  "[keyword:import] { slideParts } [keyword:from] [string:"#lib/deck-markdown.ts"];",
			  "",
			  "[keyword:export] [keyword:type] [type:Slide] = { index: [type:number]; markdown: [type:string] };",
			  "",
			  "[keyword:export] [keyword:function] [function:splitDeck](markdown: [type:string], limit = [constant:256]): [type:Slide][] {",
			  "	[keyword:const] rule =[escape: /^---$/m];",
			  "	[keyword:return] markdown.[function:split](rule).[function:map]((part, index) [keyword:=>] ({ index, markdown: [string:\`][escape:\${]part[escape:}\\n][string:\`] }));",
			  "}",
			]
		`);
	});

	it('takes the language case-insensitively and by its aliases', async () => {
		const tokens = [[{ kind: 'keyword', text: 'let' }]];
		expect(await highlightCode('let', 'TS')).toEqual(tokens);
		expect(await highlightCode('let', 'typescript')).toEqual(tokens);
	});

	it('shows a line too long to tokenize steadily as plain text', async () => {
		const long = `let a = ${'1 + '.repeat(250)}1;`;
		expect(await highlightCode(`let b;\n${long}`, 'ts')).toEqual([
			[
				{ kind: 'keyword', text: 'let' },
				{ kind: 'plain', text: ' b;' }
			],
			[{ kind: 'plain', text: long }]
		]);
	});

	it('gives nothing for a language it has no grammar for', async () => {
		expect(await highlightCode('let', 'not-a-language')).toBeUndefined();
	});
});

describe('knownLanguage', () => {
	it('knows only the languages Shiki bundles, never an object property', () => {
		expect(knownLanguage('Rust')).toBe('rust');
		for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
			expect(knownLanguage(name), name).toBeUndefined();
		}
	});
});
