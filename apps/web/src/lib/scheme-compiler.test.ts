import { describe, expect, it } from 'vitest';
import { compileScheme, compileSchemes, serializeSchemes, staleOutputs } from '#lib/scheme-compiler.ts';

const yaml = (fields: Record<string, string>, palette: Record<string, string> = {}) => {
	const colors = {
		base00: '#181818',
		base01: '#282828',
		base02: '#383838',
		base03: '#585858',
		base04: '#B8B8B8',
		base05: '#d8d8d8',
		base06: '#e8e8e8',
		base07: '#f8f8f8',
		base08: '#ab4642',
		base09: '#dc9656',
		base0A: '#f7ca88',
		base0B: '#a1b56c',
		base0C: '#86c1b9',
		base0D: '#7cafc2',
		base0E: '#ba8baf',
		base0F: '#a16946',
		...palette
	};
	return [
		'# A comment upstream files carry',
		...Object.entries({
			system: '"base16"',
			name: '"Default Dark"',
			author: '"Chris Kempson"',
			variant: '"dark"',
			...fields
		}).map(([key, value]) => `${key}: ${value}`),
		'palette:',
		...Object.entries(colors).map(([key, value]) => `  ${key}: "${value}"  # ${key}`)
	].join('\n');
};

describe('compileScheme', () => {
	it('reads the name, author, variant and colors, lowercasing hex', () => {
		const scheme = compileScheme('default-dark', yaml({}));
		expect(scheme).toMatchObject({
			slug: 'default-dark',
			name: 'Default Dark',
			author: 'Chris Kempson',
			variant: 'dark'
		});
		expect(scheme.colors.base04).toBe('#b8b8b8');
		expect(scheme.lowContrast).toBe(false);
		expect(scheme.roles.body).toBe('var(--base05)');
		expect(scheme.appRoles.danger).toBe('color-mix(in oklab, var(--base08) 70%, var(--base07))');
		expect(scheme.tokens).toMatchObject({
			keyword: 'var(--base0E)',
			comment: 'color-mix(in oklab, var(--base03) 60%, var(--base07))'
		});
	});

	it('trims the name and author', () => {
		expect(compileScheme('x', yaml({ name: '"  Default Dark "', author: '" Chris Kempson  "' }))).toMatchObject({
			name: 'Default Dark',
			author: 'Chris Kempson'
		});
	});

	it('gives an empty author when upstream leaves it out or null', () => {
		const withoutAuthor = yaml({}).replace(/^author: .*\n/m, '');
		expect(withoutAuthor).not.toContain('author');
		expect(compileScheme('x', withoutAuthor).author).toBe('');
		expect(compileScheme('x', yaml({ author: '' })).author).toBe('');
		expect(compileScheme('x', yaml({ author: 'null' })).author).toBe('');
	});

	it('takes the variant from upstream and keeps an empty author', () => {
		expect(compileScheme('x', yaml({ variant: 'light', author: '""' }))).toMatchObject({
			variant: 'light',
			author: ''
		});
	});

	it('flags a scheme low contrast when no foreground reaches 4.5:1', () => {
		const gray = { base04: '#3a3a3a', base05: '#404040', base06: '#444444', base07: '#484848' };
		expect(compileScheme('x', yaml({}, gray)).lowContrast).toBe(true);
	});

	it('refuses a scheme it cannot read', () => {
		expect(() => compileScheme('x', yaml({ system: '"base24"' }))).toThrow('x: `system` is not base16.');
		expect(() => compileScheme('x', yaml({ variant: '"dim"' }))).toThrow('x: `variant` is not dark or light.');
		expect(() => compileScheme('x', yaml({ name: '""' }))).toThrow('x: `name` is missing.');
		expect(() => compileScheme('x', yaml({ name: '1984' }))).toThrow('x: `name` is not a string.');
		expect(() => compileScheme('x', yaml({ author: '42' }))).toThrow('x: `author` is not a string.');
		expect(() => compileScheme('x', `${yaml({})}\nname: "Again"`)).toThrow(/^x: Map keys must be unique/);
		expect(() => compileScheme('x', yaml({}, { base0F: '#abc' }))).toThrow('x: `base0F` is not a #rrggbb color.');
		expect(() => compileScheme('x', yaml({}, { base0A: '' }))).toThrow('x: `base0A` is not a #rrggbb color.');
	});
});

describe('compileSchemes', () => {
	it('reads every .yaml and .yml file, sorted by slug, and records the source commit', () => {
		const file = compileSchemes(
			[
				{ name: 'zenburn.yaml', text: yaml({ name: 'Zenburn' }) },
				{ name: 'README.md', text: '# not a scheme' },
				{ name: 'cyberpunk.yml', text: yaml({ name: 'Cyberpunk' }) }
			],
			'https://github.com/tinted-theming/schemes',
			'abc123'
		);
		expect(file.commit).toBe('abc123');
		expect(file.schemes.map(({ slug, name }) => [slug, name])).toEqual([
			['cyberpunk', 'Cyberpunk'],
			['zenburn', 'Zenburn']
		]);
		expect(serializeSchemes(file)).toBe(`${JSON.stringify(file, undefined, '\t')}\n`);
	});

	it('refuses a file whose slug takes more than a-z, 0-9 and -', () => {
		for (const name of ['Default.yaml', 'default dark.yml', 'DEFAULT.YAML']) {
			expect(() => compileSchemes([{ name, text: yaml({}) }], '', ''), name).toThrow(
				`${name}: a slug takes only a-z, 0-9 and -.`
			);
		}
	});

	it('refuses two files with one slug', () => {
		const files = [
			{ name: 'a.yaml', text: yaml({}) },
			{ name: 'a.yml', text: yaml({}) }
		];
		expect(() => compileSchemes(files, '', '')).toThrow('a: two files share this slug.');
	});
});

describe('staleOutputs', () => {
	it('returns the outputs whose committed text differs or is missing', () => {
		const committed: Record<string, string> = { same: 'a\n', changed: 'b\n', crlf: 'c\r\n' };
		const outputs = [
			{ file: 'same', text: 'a\n' },
			{ file: 'changed', text: 'b' },
			{ file: 'crlf', text: 'c\n' },
			{ file: 'missing', text: 'd\n' }
		];
		expect(staleOutputs(outputs, (file) => committed[file]).map(({ file }) => file)).toEqual([
			'changed',
			'crlf',
			'missing'
		]);
	});
});
