<script lang="ts">
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { renderSlide } from '#lib/slide-render.ts';
	import { nextPreview, type PreviewState, type RenderOutcome } from '#lib/slide-preview.ts';
	import type { Notice } from '#lib/slide-notices.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import { fitStage, stageSize, type Aspect } from '#lib/stage.ts';

	let {
		slideId,
		markdown,
		aspect,
		scheme,
		schemes,
		notices = $bindable([])
	}: {
		slideId: string;
		markdown: string;
		aspect: Aspect;
		/** The deck's scheme, which a slide's own `scheme` replaces when it names one of `schemes`. */
		scheme?: Scheme;
		schemes?: readonly Scheme[];
		notices?: readonly Notice[];
	} = $props();

	const fitting = $state({ fit: 1, overflowing: false });

	// The surface's padding, which the stage fits inside.
	const inset = 28;
	const surface = $state({ width: 0, height: 0 });
	// Where the stage sits on the surface, as the stage places itself, so the fit note can sit on its corner.
	const placed = $derived(
		fitStage(stageSize(aspect), {
			width: Math.max(0, surface.width - 2 * inset),
			height: Math.max(0, surface.height - 2 * inset)
		})
	);

	// The last render stays on the stage while the next one renders, so typing and moving between slides don't flash.
	const view: { state: PreviewState | undefined } = $state({ state: undefined });

	$effect(() => {
		const id = slideId;
		const text = markdown;
		let isCurrent = true;
		void (async () => {
			let outcome: RenderOutcome;
			try {
				outcome = { slide: await renderSlide(text) };
			} catch (error) {
				outcome = { error };
			}
			if (!isCurrent) return;
			view.state = nextPreview(view.state, id, outcome);
			// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
			notices = view.state.notices;
		})();
		return () => {
			isCurrent = false;
		};
	});
</script>

<div class="preview">
	<div
		class="surface"
		style:--inset="{inset}px"
		style:--stage-x="{placed.x}px"
		style:--stage-y="{placed.y}px"
		bind:clientWidth={surface.width}
		bind:clientHeight={surface.height}>
		{#if !view.state}
			<p class="waiting" role="status">Getting slides ready…</p>
		{:else if view.state.shown}
			<SlideStage
				slide={view.state.shown}
				{aspect}
				{scheme}
				{schemes}
				bind:fit={fitting.fit}
				bind:overflowing={fitting.overflowing} />
			<!-- Only the editor says how a slide fits: presenting shows the slide as it is. -->
			{#if fitting.overflowing}
				<p class="fit-note too-long" role="status">Too long to fit, split or trim</p>
			{:else if fitting.fit < 1}
				<p class="fit-note" role="status">Shrunk to {Math.floor(fitting.fit * 100)}%</p>
			{/if}
		{:else if view.state.failure}
			<p class="waiting" role="alert">
				{#each view.state.failure.parts as part, at (at)}
					{#if typeof part === 'string'}{part}{:else}<code>{part.code}</code>{/if}
				{/each}
			</p>
		{/if}
	</div>
</div>

<style>
	.preview {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}

	.surface {
		position: relative;
		flex: 1;
		min-height: 0;
		display: grid;
		padding: var(--inset);
	}

	/* The stage sits on the surface, lifted by a shadow, and the frame around it shows no bars of its own. */
	.surface :global(.frame) {
		overflow: visible;
		background: transparent;
	}

	.surface :global(.stage) {
		box-shadow:
			0 2px 3px var(--shadow),
			0 16px 36px var(--shadow);
	}

	.fit-note {
		position: absolute;
		top: calc(var(--inset) + var(--stage-y) + 8px);
		right: calc(var(--inset) + var(--stage-x) + 8px);
		margin: 0;
		padding: 2px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--muted);
		font-family: var(--code-font);
		font-size: 12px;
		line-height: 1.5;
	}

	.fit-note.too-long {
		border-color: var(--rule);
		color: var(--heading);
	}

	.waiting {
		place-self: center;
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
</style>
