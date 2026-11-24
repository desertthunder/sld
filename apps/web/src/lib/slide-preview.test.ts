import { describe, expect, it } from 'vitest';
import { nextPreview } from '#lib/slide-preview.ts';
import { RendererLoadError, type RenderedSlide } from '#lib/slide-render.ts';
import type { SlideWarning } from '#lib/slide-meta.ts';

function rendered(html: string, warnings: SlideWarning[] = []): RenderedSlide {
	return {
		html,
		frontmatter: undefined,
		meta: { layout: 'default', notes: undefined, classes: [], scheme: undefined },
		warnings
	};
}

const broken: SlideWarning = { kind: 'invalid-frontmatter', format: 'yaml', message: 'Bad indentation', line: 2 };

describe('nextPreview', () => {
	it('shows each render that has no error, and remembers it as the last good one', () => {
		const one = rendered('<h1>One</h1>');
		const state = nextPreview(undefined, 'a', { slide: one });
		expect(state).toEqual({ id: 'a', shown: one, good: one, notices: [] });
		const two = rendered('<h1>Two</h1>');
		expect(nextPreview(state, 'a', { slide: two })).toMatchObject({ shown: two, good: two });
	});

	it('keeps the last good render while the frontmatter does not parse, and says why', () => {
		const good = rendered('<h1>Good</h1>');
		const state = nextPreview(nextPreview(undefined, 'a', { slide: good }), 'a', {
			slide: rendered('<p>---</p>', [broken])
		});
		expect(state.shown).toBe(good);
		expect(state.good).toBe(good);
		expect(state.notices).toEqual([
			{ parts: [`The frontmatter couldn't be read, so it's ignored: Bad indentation`], line: 2 }
		]);
	});

	it('keeps the last good render when a render fails', () => {
		const good = rendered('<h1>Good</h1>');
		const state = nextPreview(nextPreview(undefined, 'a', { slide: good }), 'a', { error: new Error('Boom') });
		expect(state.shown).toBe(good);
		expect(state.notices).toEqual([{ parts: ["This slide couldn't be shown: Boom"] }]);
	});

	it("says in the stage's place that slides couldn't be loaded, only while there is no good render", () => {
		const loadError = new RendererLoadError(new Error('Offline'));
		const message = { parts: ["Slides couldn't be loaded. Reload the page to try again: Offline"] };
		const failed = nextPreview(undefined, 'a', { error: loadError });
		expect(failed).toMatchObject({ shown: undefined, failure: message, notices: [message] });

		const good = nextPreview(undefined, 'a', { slide: rendered('<h1>Good</h1>') });
		expect(nextPreview(good, 'a', { error: loadError }).failure).toBeUndefined();
		expect(nextPreview(undefined, 'a', { error: new Error('Boom') }).failure).toBeUndefined();
	});

	it('shows a slide whose frontmatter never parsed as it presents, with the block as text', () => {
		const slide = rendered('<p>---</p>', [broken]);
		expect(nextPreview(undefined, 'a', { slide })).toMatchObject({ shown: slide, good: undefined });
	});

	it('never shows another slide as the last good render', () => {
		const other = nextPreview(undefined, 'a', { slide: rendered('<h1>A</h1>') });
		const slide = rendered('<p>---</p>', [broken]);
		expect(nextPreview(other, 'b', { slide })).toMatchObject({ id: 'b', shown: slide, good: undefined });
		expect(nextPreview(other, 'b', { error: new Error('Boom') })).toMatchObject({ shown: undefined });
	});

	it('updates the stage for warnings that are not errors, and lists them', () => {
		const slide = rendered('<h1>Hi</h1>', [{ kind: 'unknown-layout', value: 'hero' }]);
		const state = nextPreview(undefined, 'a', { slide });
		expect(state.shown).toBe(slide);
		expect(state.notices).toHaveLength(1);
	});
});
