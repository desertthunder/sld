import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRoles, roleCss, slideRoles, slots, type Role } from '#lib/color-roles.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { loadSchemes } from '#lib/schemes.ts';

const cssRoles = (roles: Record<string, Role>) =>
	Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, roleCss(role)]));

const file = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;

describe('the compiled Base16 schemes', () => {
	it('come from the pinned tinted-theming commit, every scheme in its base16 folder', () => {
		expect(file.source).toBe('https://github.com/tinted-theming/schemes');
		expect(file.commit).toBe('1bd5ad4c2c554c9c8e288b56deab2364ac8dada0');
		expect(file.schemes).toHaveLength(375);
		expect(new Set(file.schemes.map(({ slug }) => slug)).size).toBe(file.schemes.length);
	});

	it('each have a name, a variant and 16 #rrggbb colors', () => {
		for (const scheme of file.schemes) {
			expect(scheme.slug).toMatch(/^[\da-z-]+$/);
			expect(scheme.name, scheme.slug).not.toBe('');
			expect(typeof scheme.author, scheme.slug).toBe('string');
			expect(['dark', 'light'], scheme.slug).toContain(scheme.variant);
			expect(Object.keys(scheme.colors), scheme.slug).toEqual(slots.map((slot) => `base${slot}`));
			for (const color of Object.values(scheme.colors)) expect(color, scheme.slug).toMatch(/^#[\da-f]{6}$/);
		}
	});

	it('hold the roles the compiler gives their colors, so a change to the roles needs the file compiled again', () => {
		for (const { slug, colors, roles, appRoles: app, lowContrast } of file.schemes) {
			const slide = slideRoles(colors);
			expect(roles, slug).toEqual(cssRoles(slide));
			expect(app, slug).toEqual(cssRoles(appRoles(colors, slide)));
			expect(lowContrast, slug).toBe(slide.body.short === true);
		}
	});

	it('flag the schemes where no foreground reaches 4.5:1 as low contrast', () => {
		expect(file.schemes.filter(({ lowContrast }) => lowContrast).map(({ slug }) => slug)).toEqual([
			'brogrammer',
			'digital-rain',
			'jellybeans',
			'nova',
			'papel',
			'shades-of-purple',
			'tango',
			'vulcan',
			'zenbones'
		]);
	});

	it('keep the upstream license beside the data', () => {
		expect(readFileSync(new URL('schemes/LICENSE', import.meta.url), 'utf8')).toContain(
			'Copyright (c) 2022 Tinted Theming'
		);
	});
});

describe('loadSchemes', () => {
	it('loads every compiled scheme', async () => {
		expect(await loadSchemes()).toEqual(file.schemes);
	});

	it('is the only way the app reaches the data, and it imports it dynamically', () => {
		const source = path.join(import.meta.dirname, '..');
		const files = readdirSync(source, { recursive: true, encoding: 'utf8' }).filter(
			(name) => /\.(ts|svelte)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)
		);
		const importers = files.filter((name) => readFileSync(path.join(source, name), 'utf8').includes('base16.json'));
		expect(importers.toSorted((a, b) => a.localeCompare(b, 'en'))).toEqual([
			'compile-schemes.ts',
			path.join('lib', 'schemes.ts')
		]);
		expect(readFileSync(path.join(source, 'lib', 'schemes.ts'), 'utf8')).toMatch(
			/await import\('#lib\/schemes\/base16\.json'\)/
		);
	});
});
