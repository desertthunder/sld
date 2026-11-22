import { describe, expect, it } from 'vitest';
import { slideFrontmatter, type Frontmatter } from '#lib/deck-markdown.ts';
import { layoutClass, layouts, readSlideMeta, slideClasses } from '#lib/slide-meta.ts';

const yaml = (data: Record<string, unknown>): Frontmatter => ({ format: 'yaml', raw: '', data });

describe('layoutClass', () => {
	it.each([
		['default', 'layout-default'],
		['title', 'layout-title'],
		['center', 'layout-center'],
		['section', 'layout-section']
	] as const)('puts %s on the slide as %s', (layout, name) => {
		expect(layoutClass(layout)).toBe(name);
		expect(readSlideMeta(yaml({ layout })).meta.layout).toBe(layout);
	});

	it('covers every layout', () => {
		expect(layouts).toEqual(['default', 'title', 'center', 'section']);
	});
});

describe('readSlideMeta', () => {
	it('gives a slide with no frontmatter the default layout, no notes and no classes', () => {
		expect(readSlideMeta(undefined)).toEqual({
			meta: { layout: 'default', notes: undefined, classes: [] },
			warnings: []
		});
	});

	it('reads a layout whatever its case and surrounding spaces', () => {
		expect(readSlideMeta(yaml({ layout: ' Title ' }))).toEqual({
			meta: { layout: 'title', notes: undefined, classes: [] },
			warnings: []
		});
	});

	it.each(['two-column', '', 3, ['title'], '"><script>'])(
		'falls back to default for layout %j and warns',
		(value) => {
			expect(readSlideMeta(yaml({ layout: value }))).toEqual({
				meta: { layout: 'default', notes: undefined, classes: [] },
				warnings: [{ kind: 'unknown-layout', value }]
			});
		}
	);

	it('keeps notes as written, across lines', () => {
		const notes = 'First point\nSecond point\n';
		expect(readSlideMeta(yaml({ notes })).meta.notes).toBe(notes);
	});

	it.each([42, ['a'], { a: 1 }, true])('drops notes %j that are not a string and warns', (value) => {
		expect(readSlideMeta(yaml({ notes: value }))).toEqual({
			meta: { layout: 'default', notes: undefined, classes: [] },
			warnings: [{ kind: 'invalid-notes', value }]
		});
	});

	it('reads class as space-separated names or a list of names, without repeats', () => {
		expect(readSlideMeta(yaml({ class: '  wide\tdark  wide ' })).meta.classes).toEqual(['wide', 'dark']);
		expect(readSlideMeta(yaml({ class: ['wide', 'dark big', '_x', '-y'] })).meta.classes).toEqual([
			'wide',
			'dark',
			'big',
			'_x',
			'-y'
		]);
	});

	it('drops class names that are not valid class tokens and warns', () => {
		const { meta, warnings } = readSlideMeta(
			yaml({ class: ['ok', '"><script>', 'a"b', '1up', 'x=y', 'onclick="alert(1)"', 7] })
		);
		expect(meta.classes).toEqual(['ok']);
		expect(warnings).toEqual(
			['"><script>', 'a"b', '1up', 'x=y', 'onclick="alert(1)"', 7].map((value) => ({
				kind: 'invalid-class',
				value
			}))
		);
	});

	it.each([42, { wide: true }, true])('drops a class field %j that is neither a string nor a list', (value) => {
		expect(readSlideMeta(yaml({ class: value }))).toEqual({
			meta: { layout: 'default', notes: undefined, classes: [] },
			warnings: [{ kind: 'invalid-class', value }]
		});
	});

	it('never lets class set the layout or the stage classes', () => {
		const reserved = [
			'slide',
			'Slide',
			'layout-title',
			'Layout-Center',
			'svelte-abc123',
			'frame',
			'stage',
			'content'
		];
		const { meta, warnings } = readSlideMeta(yaml({ layout: 'center', class: [...reserved, 'wide'] }));
		expect(meta).toEqual({ layout: 'center', notes: undefined, classes: ['wide'] });
		expect(warnings).toEqual(reserved.map((value) => ({ kind: 'reserved-class', value })));
	});

	it('leaves a field with no value unset, with no warning', () => {
		const frontmatter = slideFrontmatter('---\nlayout:\nnotes:\nclass:\n---\n# One');
		expect(Object.keys(frontmatter?.data ?? {})).toEqual(['layout', 'notes', 'class']);
		expect(readSlideMeta(frontmatter)).toEqual({
			meta: { layout: 'default', notes: undefined, classes: [] },
			warnings: []
		});
	});

	it('leaves keys it does not read out of the meta, with no warning', () => {
		expect(readSlideMeta(yaml({ title: 'Hi', transition: 'fade' }))).toEqual({
			meta: { layout: 'default', notes: undefined, classes: [] },
			warnings: []
		});
	});
});

describe('slideClasses', () => {
	it('puts slide first, then the layout class, then the extra classes', () => {
		expect(slideClasses({ layout: 'section', notes: undefined, classes: ['wide', 'dark'] })).toEqual([
			'slide',
			'layout-section',
			'wide',
			'dark'
		]);
	});
});
