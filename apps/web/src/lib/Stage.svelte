<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { defaultAspect, fitStage, stageSize, type Aspect, type Fit } from '#lib/stage.ts';

	let {
		aspect = defaultAspect,
		overflowing = $bindable(false),
		children
	}: { aspect?: Aspect; overflowing?: boolean; children: Snippet } = $props();

	const size = $derived(stageSize(aspect));
	const container = $state({ width: 0, height: 0 });
	const content = $state({ width: 0, height: 0 });
	const fit: Fit = $derived(fitStage(size, container));
	let stage: HTMLElement | undefined = $state();

	// A line too long for the stage, such as in a code block, widens neither the stage nor the content, so no resize
	// reports it: measure the stage's scroll width whenever the slide's DOM, its height or its fonts change. The slide's
	// bottom padding is room its content may run into, and only content past the stage's edge is clipped, so the height
	// that counts ends at the slide's content box: line heights differ between browsers, and a slide that fits in one
	// would otherwise be flagged in another.
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
				content.height = slide.offsetTop + slide.offsetHeight - padding;
			} else {
				content.height = 0;
			}
		};
		const resizes = new ResizeObserver(measure);
		const mutations = new MutationObserver(measure);
		resizes.observe(wrapper);
		if (wrapper.firstElementChild) resizes.observe(wrapper.firstElementChild);
		mutations.observe(wrapper, { subtree: true, childList: true, characterData: true, attributes: true });
		document.fonts.addEventListener('loadingdone', measure);
		measure();
		return () => {
			resizes.disconnect();
			mutations.disconnect();
			document.fonts.removeEventListener('loadingdone', measure);
		};
	});

	$effect(() => {
		// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
		overflowing = content.height > size.height || content.width > size.width;
	});

	onDestroy(() => {
		// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
		overflowing = false;
	});
</script>

<div
	class="frame"
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
		background: var(--base00);
	}

	.stage {
		position: absolute;
		top: 0;
		left: 0;
		overflow: hidden;
		transform-origin: 0 0;
	}

	.content {
		display: flow-root;
		min-height: 100%;
	}
</style>
