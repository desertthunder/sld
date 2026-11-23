<script lang="ts">
	import { renderSlide, type RenderedSlide } from '#lib/slide-render.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import type { Aspect } from '#lib/stage.ts';

	let { markdown, aspect }: { markdown: string; aspect: Aspect } = $props();

	const view: { isNear: boolean; slide: RenderedSlide | undefined } = $state({ isNear: false, slide: undefined });
	let box: HTMLElement | undefined = $state();

	// A thumbnail renders once it scrolls near the list's view, and stays rendered after.
	$effect(() => {
		if (!box || view.isNear) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some(({ isIntersecting }) => isIntersecting)) view.isNear = true;
			},
			{ rootMargin: '200px 0px' }
		);
		observer.observe(box);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!view.isNear) return;
		const text = markdown;
		let isCurrent = true;
		void (async () => {
			try {
				const slide = await renderSlide(text);
				if (isCurrent) view.slide = slide;
			} catch {
				// A render that fails keeps the last thumbnail, and the preview says what went wrong.
			}
		})();
		return () => {
			isCurrent = false;
		};
	});
</script>

<!-- A slide's own links and controls stay out of the list: the thumbnail is a picture of the slide. -->
<span class="thumb" style:aspect-ratio={aspect.replace(':', ' / ')} inert aria-hidden="true" bind:this={box}>
	{#if view.slide}
		<span class="fill"><SlideStage slide={view.slide} {aspect} /></span>
	{/if}
</span>

<style>
	.thumb {
		position: relative;
		display: block;
		width: 100%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 5px;
		box-sizing: border-box;
		background: var(--base00);
		pointer-events: none;
	}

	.fill {
		position: absolute;
		inset: 0;
		display: block;
	}
</style>
