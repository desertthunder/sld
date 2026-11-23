<script lang="ts">
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { renderSlide } from '#lib/slide-render.ts';
	import { nextPreview, type PreviewState, type RenderOutcome } from '#lib/slide-preview.ts';
	import type { Notice } from '#lib/slide-notices.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import type { Aspect } from '#lib/stage.ts';

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
	<div class="surface">
		{#if !view.state}
			<p class="waiting" role="status">Getting slides ready…</p>
		{:else if view.state.shown}
			<SlideStage slide={view.state.shown} {aspect} {scheme} {schemes} />
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
		flex: 1;
		min-height: 0;
		display: grid;
		padding: 28px;
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

	.waiting {
		place-self: center;
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
</style>
