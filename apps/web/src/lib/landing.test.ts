import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitDeck } from '#lib/deck-markdown.ts';
import { fanDepth, fanSize, fanTransform, sampleNote, slideCount, swatch, turnFan } from '#lib/landing.ts';
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

describe('fanDepth', () => {
	it('puts the front card first and the later cards behind it in order', () => {
		expect([0, 1, 2, 3].map((index) => fanDepth(index, 0, 4))).toEqual([0, 1, 2, 3]);
	});

	it('puts the cards before the front card at the back, in order', () => {
		expect([0, 1, 2, 3].map((index) => fanDepth(index, 2, 4))).toEqual([2, 3, 0, 1]);
	});
});

describe('fanTransform', () => {
	it('gives each of a full fan of cards its own place', () => {
		const places = Array.from({ length: fanSize }, (_, depth) => fanTransform(depth));
		expect(new Set(places).size).toBe(fanSize);
	});
});

describe('turnFan', () => {
	it.each([
		[0, 1, 1],
		[3, 1, 0],
		[0, -1, 3],
		[2, -1, 1]
	])('pages from card %i by %i to card %i of four', (front, step, next) => {
		expect(turnFan(front, step, 4)).toBe(next);
	});
});

describe('swatch', () => {
	it("is the scheme's name and its colors and roles as an inline style", () => {
		const file = JSON.parse(readFileSync(new URL('schemes/base16.json', import.meta.url), 'utf8')) as SchemeFile;
		const scheme = file.schemes.find(({ slug }) => slug === 'gruvbox-dark')!;
		expect(swatch(scheme)).toEqual({ slug: 'gruvbox-dark', name: scheme.name, style: schemeStyle(scheme) });
	});
});
