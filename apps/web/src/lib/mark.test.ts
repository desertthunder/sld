import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import Mark from '#lib/Mark.svelte';
import MarkFixture from '#lib/MarkFixture.svelte';

const tileColor = '#1b1e2b';

/** A `<rect>` tag's `x y width height rx`. */
function geometry(rect: string) {
	return ['x', 'y', 'width', 'height', 'rx']
		.map((name) => Number(new RegExp(String.raw`\b${name}="([^"]+)"`).exec(rect)?.[1] ?? 0))
		.join(' ');
}

type Shape = { shape: string; cutOuts: string[] };

/** The icon's shapes in paint order, each with the tile-colored rects painted over it before the next shape. */
function iconShapes(svg: string): Shape[] {
	const [tile, ...rest] = svg.match(/<rect\b[^>]*>/g)!;
	const shapes: Shape[] = [{ shape: geometry(tile!), cutOuts: [] }];
	for (const rect of rest) {
		if (rect.includes(`fill="${tileColor}"`)) shapes.at(-1)!.cutOuts.push(geometry(rect));
		else shapes.push({ shape: geometry(rect), cutOuts: [] });
	}
	return shapes;
}

/** The mark's shapes in paint order, each with the black rects of the mask it points at. */
function markShapes(svg: string): Shape[] {
	const masks = new Map(
		svg
			.matchAll(/<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/g)
			.map(([, id, body]) => [
				id!,
				(body!.match(/<rect\b[^>]*fill="black"[^>]*>/g) ?? []).map((rect) => geometry(rect))
			])
	);
	return (svg.replace(/<defs>[\s\S]*<\/defs>/, '').match(/<rect\b[^>]*>/g) ?? []).map((rect) => {
		const mask = /mask="url\(#([^)]+)\)"/.exec(rect)?.[1];
		return { shape: geometry(rect), cutOuts: mask ? masks.get(mask)! : [] };
	});
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

it('draws the shapes of the app icon in its order, and cuts each gap and dash out of the shape the icon paints it over', () => {
	const icon = readFileSync(new URL('../../icons/icon.svg', import.meta.url), 'utf8');
	const { body } = render(Mark, { props: { colors: 'brand', size: 36 } });
	expect(markShapes(body)).toEqual(iconShapes(icon));
});
