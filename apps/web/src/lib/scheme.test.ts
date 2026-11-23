import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, roleCss, slideRoles, textFloor, tokenSlots } from '#lib/color-roles.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { schemeProperties, schemeStyle } from '#lib/scheme-style.ts';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');

const css = read('scheme.css');
const kinds = Object.keys(tokenSlots);

const file = JSON.parse(read('schemes/base16.json')) as SchemeFile;
const compiled = (slug: string) => file.schemes.find((scheme) => scheme.slug === slug)!;
const [darkBlock, lightBlock] = css.split('@media (prefers-color-scheme: light)', 2);

/** Every custom property a block of CSS declares, by name. */
function declarations(block: string): Record<string, string> {
	return Object.fromEntries(block.matchAll(/(--[\w-]+):\s*([^;]+);/g).map(([, name, value]) => [name, value]));
}

/** The `--code-*` declarations in a block of CSS, by kind. */
function tokenVariables(block: string): Record<string, string> {
	return Object.fromEntries(block.matchAll(/--code-([a-z]+):\s*([^;]+);/g).map(([, kind, value]) => [kind, value]));
}

it('applies the scheme only where the /app layout wraps the page, so it never reaches the landing page', () => {
	const selectors = css
		.matchAll(/([^{}]+)\{/g)
		.map(([, selector]) => selector.trim())
		.filter((selector) => !selector.startsWith('@'))
		.toArray();
	expect(selectors.length).toBeGreaterThan(0);
	expect(new Set(selectors)).toEqual(new Set(['.scheme', ':root:has(.scheme)']));
});

describe('the default schemes, Oxocarbon Dark and Oxocarbon Light', () => {
	const dark = declarations(darkBlock);
	const light = { ...dark, ...declarations(lightBlock) };

	it.each([
		['oxocarbon-dark', dark],
		['oxocarbon-light', light]
	])('set the colors, roles and token colors the compiler gives %s', (slug, declared) => {
		const scheme = compiled(slug);
		expect(declared['color-scheme']).toBeUndefined();
		expect(schemeStyle(scheme)).toMatch(new RegExp(`; color-scheme: ${scheme.variant}$`));
		const properties = Object.entries(schemeProperties(scheme));
		for (const [name, value] of properties) expect(declared[name], name).toBe(value);
	});

	it('keep only the splash extras beside what the compiler writes', () => {
		const written = Object.keys(schemeProperties(compiled('oxocarbon-dark')));
		expect(Object.keys(light).filter((name) => !written.includes(name))).toEqual(['--rule', '--shadow']);
	});

	it.each(['oxocarbon-dark', 'oxocarbon-light'])(
		'give %s body text WCAG AA contrast on the slide background',
		(slug) => {
			const scheme = compiled(slug);
			const { colors } = scheme;
			const roles = slideRoles(colors);
			// The roles measured here must be the ones the compiled scheme paints, not a repaired copy.
			expect(roleCss(roles.body)).toBe(scheme.roles.body);
			expect(roleCss(roles.bg)).toBe(scheme.roles.bg);
			expect(roles.bg.hex).toBe(colors.base00);
			expect(contrast(roles.body.hex, roles.bg.hex)).toBeGreaterThanOrEqual(textFloor);
			expect(compiled(slug).lowContrast).toBe(false);
		}
	);

	it('read headings from the heading role, which in Oxocarbon Dark is not the teal base07', () => {
		const { colors, roles } = compiled('oxocarbon-dark');
		expect(colors.base07).toBe('#08bdba');
		expect(roles.heading).not.toContain('base07');
		expect(dark['--heading']).toBe(roles.heading);
	});
});

it('gives destructive actions the danger color the compiler gives the default schemes', () => {
	const [dark, light] = [darkBlock, lightBlock].map((block) => declarations(block!)['--danger']);
	expect(dark).toBe(compiled('oxocarbon-dark').appRoles.danger);
	expect(light).toBe(compiled('oxocarbon-light').appRoles.danger);
});

describe('code token colors', () => {
	it('match what the compiler gives the default schemes, Oxocarbon Dark and Oxocarbon Light', () => {
		const darkTokens = tokenVariables(darkBlock);
		expect(darkTokens).toEqual(compiled('oxocarbon-dark').tokens);
		expect({ ...darkTokens, ...tokenVariables(lightBlock) }).toEqual(compiled('oxocarbon-light').tokens);
	});

	it('reach code only through the scheme variables, so a new scheme recolors it without highlighting again', () => {
		const code = read('code-block.css');
		expect(code).not.toMatch(/#[\da-f]{3,8}\b|rgb|hsl|oklch/i);
		for (const kind of kinds) {
			if (kind === 'plain') continue;
			expect(code, kind).toMatch(new RegExp(String.raw`\.code-${kind} \{\n\tcolor: var\(--code-${kind}\);`));
		}
		expect(code).toMatch(/pre\.code-block \{[^}]*\tcolor: var\(--code-plain\);/);
	});
});
