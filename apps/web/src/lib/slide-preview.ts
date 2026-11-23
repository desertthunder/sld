import { failureNotice, warningNotice, type Notice } from '#lib/slide-notices.ts';
import { RendererLoadError, type RenderedSlide } from '#lib/slide-render.ts';

/** What rendering one version of a slide's markdown gave. */
export type RenderOutcome = { slide: RenderedSlide } | { error: unknown };

/**
 * What the preview shows for the slide with `id`: the render on the stage, if any, the last render of that slide with
 * no error, the notices under the editor, and the notice that takes the stage's place when slides couldn't be loaded
 * and there is no render to show.
 */
export type PreviewState = {
	id: string;
	shown: RenderedSlide | undefined;
	good: RenderedSlide | undefined;
	notices: Notice[];
	failure?: Notice;
};

/**
 * The preview once a render of the slide with `id` comes back. A render that fails, or whose frontmatter doesn't parse,
 * leaves the slide's last good render on the stage and says why under it. With no good render of that slide yet, a
 * slide whose frontmatter doesn't parse shows as it would present, with the block as text, and slides that couldn't be
 * loaded say so in the stage's place.
 */
export function nextPreview(previous: PreviewState | undefined, id: string, outcome: RenderOutcome): PreviewState {
	const good = previous?.id === id ? previous.good : undefined;
	if ('error' in outcome) {
		const notice = failureNotice(outcome.error);
		const failure = !good && outcome.error instanceof RendererLoadError ? notice : undefined;
		return { id, shown: good, good, notices: [notice], failure };
	}
	const { slide } = outcome;
	const notices = slide.warnings.map((warning) => warningNotice(warning));
	const isBroken = slide.warnings.some(({ kind }) => kind === 'invalid-frontmatter');
	const kept = isBroken ? good : slide;
	return { id, shown: kept ?? slide, good: kept, notices };
}
