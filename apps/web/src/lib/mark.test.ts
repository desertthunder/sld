import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import MarkFixture from '#lib/MarkFixture.svelte';

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
