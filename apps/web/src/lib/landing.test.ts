import { describe, expect, it } from 'vitest';
import { splitDeck } from '#lib/deck-markdown.ts';
import { fanSize, fanTransform, sampleNote, slideCount, swatch } from '#lib/landing.ts';
import type { Scheme } from '#lib/scheme-compiler.ts';

describe('slideCount', () => {
	it.each([
		[0, '0 slides'],
		[1, '1 slide'],
		[4, '4 slides']
	])('says %i as %s', (count, text) => {
		expect(slideCount(count)).toBe(text);
	});
});

it('splits the sample note into four slides', () => {
	expect(splitDeck(sampleNote).slides.map((slide) => slide.split('\n', 1)[0])).toEqual([
		'# Field notes on sleep',
		'## The pattern',
		'## What changed',
		'## Try it'
	]);
});

describe('fanTransform', () => {
	it('gives each of a full fan of cards its own place', () => {
		const places = Array.from({ length: fanSize }, (_, index) => fanTransform(index, fanSize));
		expect(new Set(places).size).toBe(fanSize);
	});

	it('puts fewer cards in the places on the right', () => {
		expect(fanTransform(0, 1)).toBe(fanTransform(fanSize - 1, fanSize));
		expect(fanTransform(0, 2)).toBe(fanTransform(fanSize - 2, fanSize));
	});
});

describe('swatch', () => {
	const scheme = {
		slug: 'test',
		name: 'Test',
		colors: { base00: '#000000', base05: '#ffffff' },
		roles: { bg: 'var(--base00)', body: 'var(--base05)' },
		appRoles: { onPrimary: 'var(--base00)' },
		tokens: { keyword: 'var(--base0E)' }
	} as unknown as Scheme;

	it("sets the scheme's colors and redefines the page's roles over them", () => {
		const { slug, name, style } = swatch(scheme);
		expect({ slug, name }).toEqual({ slug: 'test', name: 'Test' });
		const properties = style.split('; ');
		expect(properties).toContain('--base00: #000000');
		expect(properties).toContain('--background: var(--base00)');
		expect(properties).toContain('--text: var(--base05)');
		expect(properties).toContain('--on-primary: var(--base00)');
		expect(properties).toContain('--code-keyword: var(--base0E)');
	});
});
