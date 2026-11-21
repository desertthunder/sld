<script lang="ts">
	import { errorText } from '#lib/error-text.ts';
	import { RendererLoadError, renderSlide } from '#lib/slide-render.ts';
	import Stage from '#lib/Stage.svelte';
	import { defaultAspect, layoutClass, type Aspect } from '#lib/stage.ts';

	let {
		markdown,
		aspect = defaultAspect,
		overflowing = $bindable(false)
	}: { markdown: string; aspect?: Aspect; overflowing?: boolean } = $props();

	const slide = $derived(renderSlide(markdown));
</script>

{#await slide}
	<p role="status">Getting slides ready…</p>
{:then { html, frontmatter }}
	<Stage {aspect} bind:overflowing>
		<!-- Raw HTML in a slide passes through: the markdown is the person's own. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article class="slide {layoutClass(frontmatter?.data.layout)}">{@html html}</article>
	</Stage>
{:catch error}
	{#if error instanceof RendererLoadError}
		<p role="alert">Slides couldn't be loaded. Reload the page to try again: {error.message}</p>
	{:else}
		<p role="alert">This slide couldn't be shown: {errorText(error)}</p>
	{/if}
{/await}

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
