<script lang="ts">
	import type { Notice } from '#lib/slide-notices.ts';

	let { notices, ongoto }: { notices: readonly Notice[]; ongoto?: (line: number) => void } = $props();
</script>

<div class="warnings" class:shown={notices.length > 0} role="status">
	{#if notices.length > 0}
		<span class="i-ri-alert-line icon" aria-hidden="true"></span>
		<ul>
			{#each notices as notice, index (index)}
				<li>
					<span class="text">
						{#each notice.parts as part, at (at)}
							{#if typeof part === 'string'}{part}{:else}<code>{part.code}</code>{/if}
						{/each}
					</span>
					{#if ongoto && notice.line !== undefined}
						{@const line = notice.line}
						<button class="go" type="button" aria-label="Go to line {line}" onclick={() => ongoto(line)}>
							Go to line
						</button>
					{/if}
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
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.go {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--heading);
		font: 600 13px var(--ui-font);
		cursor: pointer;
	}

	.go:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	code {
		font-family: var(--code-font);
		font-size: 0.92em;
		color: var(--heading);
	}
</style>
