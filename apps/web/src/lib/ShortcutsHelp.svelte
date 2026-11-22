<script lang="ts">
	import { keyLabel, shortcutRows } from '#lib/presenter-navigation.ts';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function closeOnScrim(event: MouseEvent) {
		if (event.target === dialog) onclose();
	}
</script>

<!-- The presenter's keys close it on ? and Esc, and a click on the scrim around the card closes it too. -->
<dialog
	class="scrim"
	bind:this={dialog}
	aria-labelledby="shortcuts-heading"
	aria-describedby="shortcuts-hint"
	onclick={closeOnScrim}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	onclose={() => {
		// The close event arrives a task late, after a quick ? may already have opened the dialog again.
		if (open && !dialog?.open) onclose();
	}}>
	<section class="help">
		<h2 id="shortcuts-heading">Shortcuts</h2>
		<p id="shortcuts-hint">Press ? or Esc to close.</p>
		<dl>
			{#each shortcutRows as { keys, gesture, description } (description)}
				<dt>
					{#if gesture}
						<span class="gesture">{gesture}</span>
					{:else}
						{#each keys as key (key)}<kbd>{keyLabel(key)}</kbd>{/each}
					{/if}
				</dt>
				<dd>{description}</dd>
			{/each}
		</dl>
	</section>
</dialog>

<style>
	.scrim {
		box-sizing: border-box;
		position: fixed;
		inset: 0;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 24px;
		border: 0;
		background: color-mix(in oklab, var(--background) 72%, transparent);
		color: var(--text);
		cursor: default;
	}

	.scrim[open] {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.scrim:focus-visible {
		outline: none;
	}

	.scrim::backdrop {
		background: transparent;
	}

	.help {
		box-sizing: border-box;
		width: 100%;
		max-width: 640px;
		max-height: 100%;
		overflow: auto;
		padding: 28px 32px 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 20px 50px var(--shadow);
	}

	h2 {
		margin: 0 0 4px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 24px;
		color: var(--heading);
	}

	p {
		margin: 0 0 18px;
		font-size: 14px;
		color: var(--muted);
	}

	dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px 20px;
		align-items: center;
		margin: 0;
		font-size: 15px;
	}

	dt {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}

	dd {
		margin: 0;
		color: var(--text);
	}

	.gesture {
		color: var(--muted);
		text-align: right;
	}

	kbd {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 6px;
		background: var(--background);
		color: var(--heading);
		font-family: var(--code-font);
		font-size: 12.5px;
	}
</style>
