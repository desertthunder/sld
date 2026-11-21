<script lang="ts">
	import '#lib/code-block.css';
	import { errorText } from '#lib/error-text.ts';
	import type { SlideOptions } from '#lib/slide-plugins.ts';
	import { RendererLoadError, renderSlide } from '#lib/slide-render.ts';

	let { markdown, lineNumbers = false }: { markdown: string } & Partial<SlideOptions> = $props();

	const slide = $derived(renderSlide(markdown, { lineNumbers }));
</script>

{#await slide}
	<p role="status">Getting slides ready…</p>
{:then { html }}
	<!-- Raw HTML in a slide passes through: the markdown is the person's own. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<article class="slide">{@html html}</article>
{:catch error}
	{#if error instanceof RendererLoadError}
		<p role="alert">Slides couldn't be loaded. Reload the page to try again: {error.message}</p>
	{:else}
		<p role="alert">This slide couldn't be shown: {errorText(error)}</p>
	{/if}
{/await}
