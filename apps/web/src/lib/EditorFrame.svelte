<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';

	let { toolbar, children }: { toolbar?: Snippet; children: Snippet } = $props();
</script>

<div class="frame">
	<header class="toolbar">
		<a class="back" href={resolve('/app')}>
			<span class="i-ri-arrow-left-s-line icon" aria-hidden="true"></span>Decks
		</a>
		{@render toolbar?.()}
	</header>
	{@render children()}
</div>

<style>
	.frame {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;
		--code-font: 'Monaspace Neon', ui-monospace, monospace;

		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--background);
		color: var(--text);
		font-family: var(--ui-font);
		font-size: 15px;
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}

	.frame :global(::selection) {
		background: var(--border);
		color: var(--heading);
	}

	.toolbar {
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		height: 56px;
		padding: 0 12px 0 8px;
		box-sizing: border-box;
		border-bottom: 1px solid var(--border);
	}

	.back {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 40px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--muted);
		text-decoration: none;
		font-weight: 500;
	}

	.icon {
		width: 18px;
		height: 18px;
	}

	.back:hover {
		background: var(--surface);
		color: var(--heading);
	}

	.back:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	@media (max-width: 760px) {
		.toolbar {
			gap: 6px;
			padding: 0 8px 0 4px;
		}

		.back {
			padding: 0 8px 0 6px;
		}
	}
</style>
