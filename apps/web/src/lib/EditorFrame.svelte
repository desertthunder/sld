<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import HomeLink from '#lib/HomeLink.svelte';

	let { toolbar, children }: { toolbar?: Snippet; children: Snippet } = $props();
</script>

<div class="frame">
	<header class="toolbar">
		<span class="home"><HomeLink /></span>
		<a class="back" href={resolve('/app')}>
			<span class="i-ri-arrow-left-s-line icon" aria-hidden="true"></span><span class="label">Decks</span>
		</a>
		{@render toolbar?.()}
		<a
			class="settings"
			href={resolve('/app/settings')}
			aria-label="Settings"
			aria-current={page.url.pathname === resolve('/app/settings') ? 'page' : undefined}>
			<span class="i-ri-settings-3-line icon" aria-hidden="true"></span>
		</a>
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
		background: var(--bg);
		color: var(--body);
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

	.home {
		flex: none;
		padding-left: 8px;
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

	.settings {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin-left: auto;
		border-radius: 8px;
		color: var(--muted);
	}

	.back:hover,
	.settings:hover,
	.settings[aria-current='page'] {
		background: var(--surface);
		color: var(--heading);
	}

	.back:focus-visible,
	.settings:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	@media (max-width: 760px) {
		.toolbar {
			gap: 6px;
			padding: 0 8px 0 4px;
		}

		.home {
			padding-left: 4px;
		}

		.back {
			padding: 0 11px;
		}

		/* The arrow stands for the link at phone width, so the deck title keeps its room beside the mark. */
		.label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
