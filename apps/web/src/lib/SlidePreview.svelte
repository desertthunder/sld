<script lang="ts">
	import { renderSlide } from '#lib/slide-render.ts';
	import { nextPreview, type PreviewState, type RenderOutcome } from '#lib/slide-preview.ts';
	import SlideStage from '#lib/SlideStage.svelte';
	import type { Aspect } from '#lib/stage.ts';

	let { slideId, markdown, aspect }: { slideId: string; markdown: string; aspect: Aspect } = $props();

	// The last render stays on the stage while the next one renders, so typing and moving between slides don't flash.
	const view: { state: PreviewState | undefined } = $state({ state: undefined });
	const notices = $derived(view.state?.notices ?? []);

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
			if (isCurrent) view.state = nextPreview(view.state, id, outcome);
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
			<SlideStage slide={view.state.shown} {aspect} />
		{/if}
	</div>
	<div class="notices" class:shown={notices.length > 0} role="status">
		{#if notices.length > 0}
			<span class="i-ri-error-warning-line icon" aria-hidden="true"></span>
			<ul>
				{#each notices as notice, index (index)}
					<li>
						{#each notice as part, at (at)}
							{#if typeof part === 'string'}{part}{:else}<code>{part.code}</code>{/if}
						{/each}
					</li>
				{/each}
			</ul>
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

	.notices {
		flex: none;
	}

	.notices.shown {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 16px;
		border-top: 2px solid var(--rule);
		background: var(--background);
		color: var(--text);
		font-size: 13.5px;
		line-height: 1.45;
	}

	.icon {
		flex: none;
		width: 18px;
		height: 18px;
		color: var(--rule);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	code {
		font-family: var(--code-font);
		font-size: 0.92em;
		color: var(--heading);
	}
</style>
