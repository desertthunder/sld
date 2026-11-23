import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitDeck } from '#lib/deck-markdown.ts';
import { fanSize, fanTransform, sampleNote, slideCount, swatch } from '#lib/landing.ts';
import type { SchemeFile } from '#lib/scheme-compiler.ts';
import { schemeStyle } from '#lib/scheme-style.ts';

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
	it("is the scheme's name and its colors and roles as an inline style", () => {
		const file = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
		const scheme = file.schemes.find(({ slug }) => slug === 'gruvbox-dark')!;
		expect(swatch(scheme)).toEqual({ slug: 'gruvbox-dark', name: scheme.name, style: schemeStyle(scheme) });
	});
});
