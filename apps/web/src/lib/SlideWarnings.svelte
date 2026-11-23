<script lang="ts">
	import type { Notice } from '#lib/slide-notices.ts';

	let { notices }: { notices: readonly Notice[] } = $props();
</script>

<!-- TODO: add a "Go to line" button once the editor can move to a line. -->
<div class="warnings" class:shown={notices.length > 0} role="status">
	{#if notices.length > 0}
		<span class="i-ri-alert-line icon" aria-hidden="true"></span>
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

<style>
	.warnings {
		flex: none;
	}

	.warnings.shown {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px 10px 16px;
		border-top: 2px solid var(--rule);
		background: var(--surface);
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
		flex: 1;
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
