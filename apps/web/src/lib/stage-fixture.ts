import { mount, unmount } from 'svelte';
import { sampleSlide } from '#lib/sample-slide.ts';
import { loadSchemes } from '#lib/schemes.ts';
import Slide from '#lib/Slide.svelte';

function showPreview(style: string): HTMLElement {
	for (const child of document.body.children) (child as HTMLElement).style.display = 'none';
	const preview = document.createElement('div');
	preview.className = 'preview';
	preview.style.cssText = style;
	document.body.prepend(preview);
	return preview;
}

/**
 * Draws the sample slide in a 16:9 box, at most 960 pixels wide, in place of the page, for the stage's browser tests.
 * The page stays in the document, hidden, so its scheme still applies. Nothing in the app imports this: the tests load
 * it from the dev server.
 */
export function showSampleSlide(): void {
	mount(Slide, { target: showPreview('aspect-ratio: 16 / 9; max-width: 960px'), props: { markdown: sampleSlide } });
}

const styled: { shown?: { preview: HTMLElement; slide: ReturnType<typeof mount> } } = {};

/**
 * Draws `markdown` as a slide in the scheme `slug`, filling the window, for the slide styles' browser tests. It
 * replaces the slide it drew last.
 */
export async function showStyledSlide(markdown: string, slug: string): Promise<void> {
	const schemes = await loadSchemes();
	const scheme = schemes.find((candidate) => candidate.slug === slug);
	if (!scheme) throw new Error(`No scheme ${slug}`);
	if (styled.shown) {
		await unmount(styled.shown.slide);
		styled.shown.preview.remove();
	}
	const preview = showPreview('position: fixed; inset: 0');
	styled.shown = { preview, slide: mount(Slide, { target: preview, props: { markdown, scheme } }) };
}
