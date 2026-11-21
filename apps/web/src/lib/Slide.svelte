<script lang="ts">
	import { errorText } from '#lib/error-text.ts';
	import { renderSlide } from '#lib/slide-render.ts';

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
	<p role="alert">This slide couldn't be shown: {errorText(error)}</p>
{/await}
