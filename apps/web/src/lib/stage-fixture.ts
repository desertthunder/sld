import { mount } from 'svelte';
import { sampleSlide } from '#lib/sample-slide.ts';
import Slide from '#lib/Slide.svelte';

/**
 * Draws the sample slide in a 16:9 box, at most 960 pixels wide, in place of the page, for the stage's browser tests.
 * The page stays in the document, hidden, so its scheme still applies. Nothing in the app imports this: the tests load
 * it from the dev server.
 */
export function showSampleSlide(): void {
	for (const child of document.body.children) (child as HTMLElement).style.display = 'none';
	const preview = document.createElement('div');
	preview.className = 'preview';
	preview.style.cssText = 'aspect-ratio: 16 / 9; max-width: 960px';
	document.body.prepend(preview);
	mount(Slide, { target: preview, props: { markdown: sampleSlide } });
}
