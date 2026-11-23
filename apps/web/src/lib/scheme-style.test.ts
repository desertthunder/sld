import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { schemeProperties, schemeStyle } from '#lib/scheme-style.ts';

const { schemes } = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
const nord = schemes.find(({ slug }) => slug === 'nord')!;

it('sets the colors, the slide roles, the app roles in kebab case and the token colors', () => {
	const properties = schemeProperties(nord);
	expect(properties['--base00']).toBe(nord.colors.base00);
	expect(properties['--base0F']).toBe(nord.colors.base0F);
	for (const role of [
		'bg',
		'surface',
		'border',
		'selection',
		'body',
		'muted',
		'heading',
		'link',
		'accent'
	] as const) {
		expect(properties[`--${role}`], role).toBe(nord.roles[role]);
	}
	expect(properties['--canvas']).toBe(nord.appRoles.canvas);
	expect(properties['--text']).toBe(nord.appRoles.text);
	expect(properties['--on-primary']).toBe(nord.appRoles.onPrimary);
	expect(properties['--danger']).toBe(nord.appRoles.danger);
	expect(properties['--code-keyword']).toBe(nord.tokens.keyword);
	expect(Object.keys(properties)).not.toContain('--onPrimary');
});

it('writes an inline style with the color-scheme of the variant', () => {
	const style = schemeStyle(nord);
	expect(style).toContain(`--base00: ${nord.colors.base00}; `);
	expect(style).toContain(`--heading: ${nord.roles.heading}; `);
	expect(style.endsWith('; color-scheme: dark')).toBe(true);
});
