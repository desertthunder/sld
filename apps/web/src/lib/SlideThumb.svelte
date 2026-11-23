<script lang="ts">
	import { renderSlide } from '#lib/slide-render.ts';
	import { nextPreview, type PreviewState, type RenderOutcome } from '#lib/slide-preview.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import type { Aspect } from '#lib/stage.ts';
	import { thumbnailHtml } from '#lib/thumbnail-html.ts';

	let { slideId, markdown, aspect }: { slideId: string; markdown: string; aspect: Aspect } = $props();

	const view: { isNear: boolean; state: PreviewState | undefined } = $state({ isNear: false, state: undefined });
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

	// Like the preview, a thumbnail keeps the slide's last good render while it fails or its frontmatter doesn't parse.
	$effect(() => {
		if (!view.isNear) return;
		const id = slideId;
		const text = markdown;
		let isCurrent = true;
		void (async () => {
			let outcome: RenderOutcome;
			try {
				const slide = await renderSlide(text);
				outcome = { slide: { ...slide, html: thumbnailHtml(slide.html) } };
			} catch (error) {
				outcome = { error };
			}
			if (isCurrent) view.state = nextPreview(view.state, id, outcome);
		})();
		return () => {
			isCurrent = false;
		};
	});

	// Autoplay waits for media data, so it hasn't started when this runs after the slide is drawn.
	$effect(() => {
		if (!box || !view.state?.shown) return;
		for (const media of box.querySelectorAll<HTMLMediaElement>('audio, video')) {
			media.autoplay = false;
			media.muted = true;
			media.pause();
		}
	});
</script>

<!-- A slide's own links, controls and sound stay out of the list: the thumbnail is a picture of the slide. -->
<span class="thumb" style:aspect-ratio={aspect.replace(':', ' / ')} inert aria-hidden="true" bind:this={box}>
	{#if view.state?.shown}
		<span class="fill"><SlideStage slide={view.state.shown} {aspect} /></span>
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

	.thumb :global([data-frame]) {
		/* An iframe's own box: content-box sizing, with a 2px border. */
		display: inline-block;
		box-sizing: content-box;
		border: 2px solid var(--base02);
		background: var(--base01);
		vertical-align: middle;
	}

	.fill {
		position: absolute;
		inset: 0;
		display: block;
	}
</style>
