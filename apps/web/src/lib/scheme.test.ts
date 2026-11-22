import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenSlots } from '#lib/color-roles.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');

const css = read('scheme.css');
const kinds = Object.keys(tokenSlots);

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

it('gives destructive actions the danger color the compiler gives the default schemes', () => {
	const file = JSON.parse(read('schemes/base16.json')) as SchemeFile;
	const danger = (slug: string) => file.schemes.find((scheme) => scheme.slug === slug)!.appRoles.danger;
	const [dark, light] = css
		.split('@media (prefers-color-scheme: light)', 2)
		.map((block) => block.match(/--danger:\s*([^;]+);/)?.[1]);
	expect(dark).toBe(danger('oxocarbon-dark'));
	expect(light).toBe(danger('oxocarbon-light'));
});

describe('code token colors', () => {
	it('match what the compiler gives the default schemes, Oxocarbon Dark and Oxocarbon Light', () => {
		const file = JSON.parse(read('schemes/base16.json')) as SchemeFile;
		const tokens = (slug: string) => file.schemes.find((scheme) => scheme.slug === slug)!.tokens;
		const [dark, light] = css.split('@media (prefers-color-scheme: light)', 2);
		const darkTokens = tokenVariables(dark);
		expect(darkTokens).toEqual(tokens('oxocarbon-dark'));
		expect({ ...darkTokens, ...tokenVariables(light) }).toEqual(tokens('oxocarbon-light'));
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
