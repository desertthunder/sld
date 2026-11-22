import { describe, expect, it, vi } from 'vitest';
import { highlightCode, type Token } from '#lib/code-highlight.ts';

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

	it('gives HTML and JSX tag names their own kind, components included', async () => {
		const tsx = 'const view = <Slide markdown="a"><p>{count}</p></Slide>;';
		expect(marked((await highlightCode(tsx, 'tsx'))!)).toMatchInlineSnapshot(`
			[
			  "[keyword:const] view = <[tag:Slide] [constant:markdown]=[string:"a"]><[tag:p]>[escape:{]count[escape:}]</[tag:p]></[tag:Slide]>;",
			]
		`);
		expect(marked((await highlightCode('<p class="lead">Hi</p>', 'html'))!)).toMatchInlineSnapshot(`
			[
			  "<[tag:p] [constant:class]=[string:"lead"]>Hi</[tag:p]>",
			]
		`);
	});

	it('gives format placeholders the escape kind, never the constant kind', async () => {
		const go = 'return fmt.Errorf("load %d slides: %w", n, err)';
		expect(marked((await highlightCode(go, 'go'))!)).toMatchInlineSnapshot(`
			[
			  "[keyword:return] fmt.[function:Errorf]([string:"load ][escape:%d][string: slides: ][escape:%w][string:"], n, err)",
			]
		`);
		const c = String.raw`printf("%-5.2f %s\n", x, s);`;
		expect(marked((await highlightCode(c, 'c'))!)).toMatchInlineSnapshot(`
			[
			  "[function:printf]([string:"][escape:%-5.2f][string: ][escape:%s\\n][string:"], x, s);",
			]
		`);
		const python = 'print("{} {name:>10}".format(a), f"{x:.2f}", "%d" % n)';
		expect(marked((await highlightCode(python, 'python'))!)).toMatchInlineSnapshot(`
			[
			  "[function:print]([string:"][escape:{}][string: ][escape:{name:>10}][string:"].[function:format](a), [keyword:f][string:"][escape:{]x[escape::.2f}][string:"], [string:"][escape:%d][string:"] % n)",
			]
		`);
		const rust = 'println!("{} {:?} {0:>5}", a, b);';
		expect(marked((await highlightCode(rust, 'rust'))!)).toMatchInlineSnapshot(`
			[
			  "[function:println!]([string:"][escape:{}][string: ][escape:{:?}][string: ][escape:{0:>5}][string:"], a, b);",
			]
		`);
	});

	it('takes the language case-insensitively and by its aliases', async () => {
		const tokens = [[{ kind: 'keyword', text: 'let' }]];
		expect(await highlightCode('let', 'TS')).toEqual(tokens);
		expect(await highlightCode('let', 'typescript')).toEqual(tokens);
	});

	it('shows a line too long to tokenize steadily as plain text', async () => {
		const long = `let a = ${'1 + '.repeat(47)}111;`;
		expect(long).toHaveLength(200);
		expect(await highlightCode(`let b;\n${long}`, 'ts')).toEqual([
			[
				{ kind: 'keyword', text: 'let' },
				{ kind: 'plain', text: ' b;' }
			],
			[{ kind: 'plain', text: long }]
		]);
	});

	it('tokenizes a line of 199 characters', async () => {
		const line = `let a = ${'1 + '.repeat(47)}11;`;
		expect(line).toHaveLength(199);
		expect((await highlightCode(line, 'ts'))![0][0]).toEqual({ kind: 'keyword', text: 'let' });
	});

	it('shows lines past the 100th as plain text', async () => {
		const lines = await highlightCode(Array.from({ length: 102 }, () => 'let a;').join('\n'), 'ts');
		expect(lines).toHaveLength(102);
		expect(lines![99][0]).toEqual({ kind: 'keyword', text: 'let' });
		expect(lines![100]).toEqual([{ kind: 'plain', text: 'let a;' }]);
		expect(lines![101]).toEqual([{ kind: 'plain', text: 'let a;' }]);
	});

	it('asks for a grammar again after it failed to download', async () => {
		vi.resetModules();
		let calls = 0;
		vi.doMock('shiki/langs', async () => {
			const real = await vi.importActual<typeof import('shiki/langs')>('shiki/langs');
			const ts = () => {
				calls += 1;
				return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : real.bundledLanguages.ts();
			};
			return { ...real, bundledLanguages: { ...real.bundledLanguages, ts } };
		});
		try {
			const fresh = await import('#lib/code-highlight.ts');
			await expect(fresh.highlightCode('let a;', 'ts')).rejects.toThrow('Failed to fetch');
			expect(await fresh.highlightCode('let a;', 'ts')).toEqual([
				[
					{ kind: 'keyword', text: 'let' },
					{ kind: 'plain', text: ' a;' }
				]
			]);
			expect(calls).toBe(2);
		} finally {
			vi.doUnmock('shiki/langs');
		}
	});

	it('gives nothing for a language it has no grammar for', async () => {
		expect(await highlightCode('let', 'not-a-language')).toBeUndefined();
	});
});
