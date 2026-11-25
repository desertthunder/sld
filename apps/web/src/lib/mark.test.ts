import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import Mark from '#lib/Mark.svelte';
import MarkFixture from '#lib/MarkFixture.svelte';

/** Each `<rect>` in `svg` as `x y width height rx`. */
function rects(svg: string) {
	return svg
		.matchAll(/<rect\b[^>]*>/g)
		.map(([rect]) =>
			['x', 'y', 'width', 'height', 'rx']
				.map((name) => Number(new RegExp(String.raw`\b${name}="([^"]+)"`).exec(rect)?.[1] ?? 0))
				.join(' ')
		)
		.toArray()
		.toSorted((a, b) => a.localeCompare(b));
}

it('gives every mark on a page its own mask ids, and points each mask reference at its own mark', () => {
	const { body } = render(MarkFixture);
	const marks = body.match(/<svg[\s\S]*?<\/svg>/g)!;
	expect(marks).toHaveLength(2);
	const ids = marks.map((mark) =>
		mark
			.matchAll(/<mask id="([^"]+)"/g)
			.map(([, id]) => id)
			.toArray()
	);
	expect(ids.map((own) => own.length)).toEqual([3, 3]);
	expect(new Set(ids.flat()).size).toBe(6);
	for (const [index, mark] of marks.entries()) {
		const references = mark
			.matchAll(/mask="url\(#([^)]+)\)"/g)
			.map(([, id]) => id)
			.toArray();
		expect(references).toEqual(ids[index]);
	}
});

it('draws the shapes of the app icon', () => {
	const icon = readFileSync(new URL('../../icons/icon.svg', import.meta.url), 'utf8');
	const { body } = render(Mark, { props: { colors: 'brand', size: 36 } });
	// A mask's white backdrop only lets the shape through; it isn't one of the icon's shapes.
	expect(rects(body.replaceAll(/<rect\b[^>]*fill="white"[^>]*>/g, ''))).toEqual(rects(icon));
});
