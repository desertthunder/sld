<script lang="ts">
	import type { Snippet } from 'svelte';
	import '#lib/code-block.css';
	import { errorText } from '#lib/error-text.ts';
	import type { SlideOptions } from '#lib/slide-plugins.ts';
	import { slideClasses } from '#lib/slide-meta.ts';
	import { RendererLoadError, renderSlide, type RenderedSlide } from '#lib/slide-render.ts';
	import Stage from '#lib/Stage.svelte';
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
	{@const { html, meta } = view.shown.slide}
	<Stage {aspect} bind:overflowing>
		<!-- Raw HTML in a slide passes through: the markdown is the person's own. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article class={slideClasses(meta)}>{@html html}</article>
		<!-- Drawn on the stage in its pixels, above the slide, and not measured as the slide's content. -->
		{@render overlay?.()}
	</Stage>
{:else if view.shown.error instanceof RendererLoadError}
	<p role="alert">Slides couldn't be loaded. Reload the page to try again: {view.shown.error.message}</p>
{:else}
	<p role="alert">This slide couldn't be shown: {errorText(view.shown.error)}</p>
{/if}

<style>
	/* Slides draw in the stage's pixels, so a slide looks the same at every size. */
	.slide {
		box-sizing: border-box;
		padding: 64px 96px;
		font-size: 32px;
		overflow-wrap: anywhere;
	}

	.slide :global(:is(img, video)) {
		max-width: 100%;
		height: auto;
	}

	/* A trailing margin would make a slide that fits measure taller than the stage. */
	:where(.slide) :global(:last-child) {
		margin-bottom: 0;
	}
</style>
