<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { schemeStyle } from '#lib/scheme-style.ts';
	import { contentBottom, sizeEvents } from '#lib/slide-fit.ts';
	import { defaultAspect, fitStage, stageSize, type Aspect, type Fit } from '#lib/stage.ts';

	let {
		aspect = defaultAspect,
		scheme,
		overflowing = $bindable(false),
		children
	}: { aspect?: Aspect; scheme?: Scheme; overflowing?: boolean; children: Snippet } = $props();

	const size = $derived(stageSize(aspect));
	const container = $state({ width: 0, height: 0 });
	const content = $state({ width: 0, height: 0, clipped: false });
	const fit: Fit = $derived(fitStage(size, container));
	let stage: HTMLElement | undefined = $state();

	function hasClippedContent(slide: HTMLElement): boolean {
		return [...slide.querySelectorAll('*')].some((element) => {
			if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)
				return false;
			// A box a pixel wide and tall hides its text on purpose, for screen readers only.
			if (element.clientWidth <= 1 && element.clientHeight <= 1) return false;
			const { overflowX, overflowY } = getComputedStyle(element);
			return overflowX !== 'visible' || overflowY !== 'visible';
		});
	}

	// A line too long for the stage, such as in a code block, widens neither the stage nor the content, so no resize
	// reports it: measure the stage's scroll width whenever the slide's DOM, its fonts or its media change. A slide is as
	// tall as the stage and clips at its bottom margin, so the height that counts is where its lowest child ends, plus
	// that margin. An element that clips its own overflow, such as a code block, hides a line before it reaches the
	// stage's edge, so the slide also counts as overflowing when one of those clips something.
	$effect(() => {
		if (!stage) return;
		const element = stage;
		const wrapper = element.firstElementChild as HTMLElement;
		const measure = () => {
			content.width = element.scrollWidth;
			const slide = wrapper.firstElementChild;
			if (slide instanceof HTMLElement) {
				// eslint-disable-next-line unicorn/prefer-number-coercion -- The computed padding ends in px, which Number() rejects.
				const padding = Number.parseFloat(getComputedStyle(slide).paddingBottom);
				content.height = slide.offsetTop + contentBottom(slide) + padding;
				content.clipped = hasClippedContent(slide);
			} else {
				content.height = 0;
				content.clipped = false;
			}
		};
		const resizes = new ResizeObserver(measure);
		const mutations = new MutationObserver(measure);
		resizes.observe(wrapper);
		if (wrapper.firstElementChild) resizes.observe(wrapper.firstElementChild);
		mutations.observe(wrapper, { subtree: true, childList: true, characterData: true, attributes: true });
		for (const type of sizeEvents) wrapper.addEventListener(type, measure, { capture: true });
		document.fonts.addEventListener('loadingdone', measure);
		measure();
		return () => {
			resizes.disconnect();
			mutations.disconnect();
			for (const type of sizeEvents) wrapper.removeEventListener(type, measure, { capture: true });
			document.fonts.removeEventListener('loadingdone', measure);
		};
	});

	$effect(() => {
		// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
		overflowing = content.clipped || content.height > size.height || content.width > size.width;
	});

	onDestroy(() => {
		// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
		overflowing = false;
	});
</script>

<!-- A scheme only sets custom properties here, so changing it repaints the slide without rendering it again. -->
<div
	class="frame"
	style={scheme && schemeStyle(scheme)}
	bind:clientWidth={container.width}
	bind:clientHeight={container.height}
	data-overflowing={overflowing}>
	<div
		class="stage"
		bind:this={stage}
		style:width="{size.width}px"
		style:height="{size.height}px"
		style:transform="translate({fit.x}px, {fit.y}px) scale({fit.scale})"
		style:visibility={fit.scale > 0 ? 'visible' : 'hidden'}>
		<div class="content">{@render children()}</div>
	</div>
</div>

<style>
	.frame {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg);
		color: var(--body);
	}

	.stage {
		position: absolute;
		top: 0;
		left: 0;
		overflow: hidden;
		transform-origin: 0 0;
		background: var(--bg);
	}

	.content {
		display: flow-root;
		height: 100%;
	}
</style>
