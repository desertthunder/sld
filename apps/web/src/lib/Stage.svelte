<script lang="ts">
	import type { Snippet } from 'svelte';
	import { defaultAspect, fitStage, stageSize, type Aspect, type Fit } from '#lib/stage.ts';

	let {
		aspect = defaultAspect,
		overflowing = $bindable(false),
		children
	}: { aspect?: Aspect; overflowing?: boolean; children: Snippet } = $props();

	const size = $derived(stageSize(aspect));
	const container = $state({ width: 0, height: 0 });
	const content = $state({ height: 0 });
	const fit: Fit = $derived(fitStage(size, container));

	$effect(() => {
		// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
		overflowing = content.height > size.height;
	});
</script>

<div
	class="frame"
	bind:clientWidth={container.width}
	bind:clientHeight={container.height}
	data-overflowing={overflowing}>
	<div
		class="stage"
		style:width="{size.width}px"
		style:height="{size.height}px"
		style:transform="translate({fit.x}px, {fit.y}px) scale({fit.scale})"
		style:visibility={fit.scale > 0 ? 'visible' : 'hidden'}>
		<div class="content" bind:offsetHeight={content.height}>{@render children()}</div>
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

	/* Grows with the slide, so its height says when the slide is taller than the stage. */
	.content {
		display: flow-root;
		min-height: 100%;
	}
</style>
