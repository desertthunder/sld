<script lang="ts">
	import type { Snippet } from 'svelte';
	import '#lib/code-block.css';
	import { slideClasses } from '#lib/slide-meta.ts';
	import type { RenderedSlide } from '#lib/slide-render.ts';
	import Stage from '#lib/Stage.svelte';
	import { defaultAspect, type Aspect } from '#lib/stage.ts';

	let {
		slide,
		aspect = defaultAspect,
		overflowing = $bindable(false),
		overlay
	}: { slide: RenderedSlide; aspect?: Aspect; overflowing?: boolean; overlay?: Snippet } = $props();
</script>

<Stage {aspect} bind:overflowing>
	<!-- Raw HTML in a slide passes through: the markdown is the person's own. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<article class={slideClasses(slide.meta)}>{@html slide.html}</article>
	<!-- Drawn on the stage in its pixels, above the slide, and not measured as the slide's content. -->
	{@render overlay?.()}
</Stage>

<style>
	/*
	 * Slides draw in the stage's pixels, so a slide looks the same at every size. The text settings are set here rather
	 * than inherited, so a slide looks the same in the editor's panes as when it presents.
	 */
	.slide {
		box-sizing: border-box;
		padding: 64px 96px;
		color: var(--text);
		font-family: var(--ui-font);
		font-size: 32px;
		font-style: normal;
		font-weight: 400;
		line-height: normal;
		letter-spacing: normal;
		text-align: start;
		white-space: normal;
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
