<script lang="ts">
	import type { Snippet } from 'svelte';
	import { errorText } from '#lib/error-text.ts';
	import type { SlideOptions } from '#lib/slide-plugins.ts';
	import { RendererLoadError, renderSlide, type RenderedSlide } from '#lib/slide-render.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import { defaultAspect, type Aspect } from '#lib/stage.ts';

	let {
		markdown,
		aspect = defaultAspect,
		lineNumbers = false,
		overflowing = $bindable(false),
		overlay
	}: {
		markdown: string;
		aspect?: Aspect;
		overflowing?: boolean;
		overlay?: Snippet;
	} & Partial<SlideOptions> = $props();

	type Shown =
		{ status: 'pending' } | { status: 'shown'; slide: RenderedSlide } | { status: 'failed'; error: unknown };

	// The last slide stays on the stage while the next one renders, so moving between slides doesn't flash.
	const view: { shown: Shown } = $state({ shown: { status: 'pending' } });

	$effect(() => {
		let isCurrent = true;
		void (async () => {
			let shown: Shown;
			try {
				shown = { status: 'shown', slide: await renderSlide(markdown, { lineNumbers }) };
			} catch (error) {
				shown = { status: 'failed', error };
			}
			if (isCurrent) view.shown = shown;
		})();
		return () => {
			isCurrent = false;
		};
	});
</script>

{#if view.shown.status === 'pending'}
	<p role="status">Getting slides ready…</p>
{:else if view.shown.status === 'shown'}
	<SlideStage slide={view.shown.slide} {aspect} bind:overflowing {overlay} />
{:else if view.shown.error instanceof RendererLoadError}
	<p role="alert">Slides couldn't be loaded. Reload the page to try again: {view.shown.error.message}</p>
{:else}
	<p role="alert">This slide couldn't be shown: {errorText(view.shown.error)}</p>
{/if}
