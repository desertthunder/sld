import type { Scheme } from '#lib/scheme-compiler.ts';
import { schemeStyle } from '#lib/scheme-style.ts';

/** The note the landing page's paste box starts with. */
export const sampleNote = `# Field notes on sleep

What I learned keeping a sleep diary for a month.

---

## The pattern

- Late coffee cost me 40 minutes
- Weekends shifted everything by two hours

---

## What changed

A fixed wake-up time mattered more than bedtime.

---

## Try it

Keep a diary for one week. Notice one thing.
`;

/** How many slides a deck has, as the landing page says it. */
export function slideCount(count: number): string {
	return count === 1 ? '1 slide' : `${count} slides`;
}

/** The decks the landing page shows as divider tabs, to illustrate decks kept in the browser. */
export const sampleDecks = [
	{ title: 'Field notes on sleep', slides: 4 },
	{ title: 'Team retro, March', slides: 9 },
	{ title: 'Intro to Postgres', slides: 18 }
] as const;

/** How many of the note's slides the landing page deals as cards. */
export const fanSize = 4;

const fan = [
	'translate(0%, 18%) rotate(-7deg)',
	'translate(9%, 10%) rotate(-2.5deg)',
	'translate(18%, 4%) rotate(2deg)',
	'translate(26%, 0%) rotate(6deg)'
];

/** The transform of the card at `index` of `count` dealt cards. Fewer cards take the places on the right. */
export function fanTransform(index: number, count: number): string {
	return fan[(fanSize - Math.min(count, fanSize) + index) % fanSize]!;
}

/** The schemes the landing page shows a slide in, by slug. */
export const swatchSchemes = ['oxocarbon-dark', 'oxocarbon-light', 'gruvbox-dark'] as const;

/** What a scheme swatch needs: the scheme's name, and its colors and roles as CSS custom properties. */
export type Swatch = { slug: string; name: string; style: string };

/** A scheme as a swatch, with its colors and roles set in place of the page's. */
export function swatch(scheme: Scheme): Swatch {
	return { slug: scheme.slug, name: scheme.name, style: schemeStyle(scheme) };
}
