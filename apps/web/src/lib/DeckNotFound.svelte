<script lang="ts">
	import { resolve } from '$app/paths';
	import { appName } from '#lib/app-info.ts';
	import EditorFrame from '#lib/EditorFrame.svelte';

	/** Whether the deck was open here when another tab deleted it. */
	let { isDeleted = false }: { isDeleted?: boolean } = $props();

	const heading = $derived(isDeleted ? 'Deck deleted' : 'Deck not found');
</script>

<svelte:head>
	<title>{heading} · {appName}</title>
</svelte:head>

<EditorFrame>
	<main class="missing">
		<div class="card">
			<h1>{heading}</h1>
			{#if isDeleted}
				<p>Another tab deleted this deck while it was open here.</p>
			{:else}
				<p>
					It may have been deleted, or the link came from another browser. Decks live only in the browser that
					made them.
				</p>
			{/if}
			<a class="primary" href={resolve('/app')}>Back to decks</a>
		</div>
	</main>
</EditorFrame>

<style>
	.missing {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		overflow: auto;
	}

	.card {
		position: relative;
		width: 100%;
		max-width: 520px;
		padding: 40px 36px 32px;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow:
			0 2px 3px var(--shadow),
			0 20px 44px var(--shadow);
	}

	.card::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 3px;
		background: var(--rule);
		border-radius: 12px 12px 0 0;
	}

	h1 {
		margin: 0 0 10px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 28px;
		line-height: 1.15;
		letter-spacing: -0.02em;
		color: var(--heading);
	}

	p {
		margin: 0 0 24px;
		max-width: 44ch;
	}

	.primary {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 20px;
		border-radius: 10px;
		background: var(--link);
		color: var(--on-primary);
		font: 600 15px var(--ui-font);
		text-decoration: none;
	}

	.primary:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	@media (max-width: 520px) {
		.card {
			padding: 32px 24px 24px;
		}

		h1 {
			font-size: 24px;
		}
	}
</style>
