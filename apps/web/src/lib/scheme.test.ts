import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('applies the scheme only where the /app layout wraps the page, so it never reaches the landing page', () => {
	const css = readFileSync(new URL('scheme.css', import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');
	const selectors = css
		.matchAll(/([^{}]+)\{/g)
		.map(([, selector]) => selector.trim())
		.filter((selector) => !selector.startsWith('@'))
		.toArray();
	expect(selectors.length).toBeGreaterThan(0);
	expect(new Set(selectors)).toEqual(new Set(['.scheme', ':root:has(.scheme)']));
});
