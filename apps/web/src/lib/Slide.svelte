<script lang="ts">
	import { errorText } from '#lib/error-text.ts';
	import { RendererLoadError, renderSlide } from '#lib/slide-render.ts';

	let { markdown }: { markdown: string } = $props();

	const slide = $derived(renderSlide(markdown));
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
