<script lang="ts">
	let { open, onchoose }: { open: boolean; onchoose: (shouldLeave: boolean) => void } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let stay: HTMLButtonElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			stay?.focus();
		} else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	class="scrim"
	bind:this={dialog}
	aria-labelledby="leave-text"
	oncancel={(event) => {
		event.preventDefault();
		onchoose(false);
	}}>
	<section class="card">
		<p id="leave-text">Some changes weren't saved. Leave anyway?</p>
		<div class="actions">
			<button class="leave" type="button" onclick={() => onchoose(true)}>Leave</button>
			<button class="stay" type="button" bind:this={stay} onclick={() => onchoose(false)}>Stay</button>
		</div>
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
		font-family: var(--ui-font);
	}

	.scrim[open] {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.scrim::backdrop {
		background: transparent;
	}

	.card {
		box-sizing: border-box;
		width: 100%;
		max-width: 420px;
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 20px 50px var(--shadow);
	}

	p {
		margin: 0 0 20px;
		font-size: 16px;
		line-height: 1.5;
		color: var(--heading);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	button {
		min-height: 40px;
		padding: 0 16px;
		border-radius: 9px;
		font: 600 14px var(--ui-font);
		cursor: pointer;
	}

	.leave {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--heading);
	}

	.leave:hover {
		background: var(--background);
	}

	.stay {
		border: 0;
		background: var(--link);
		color: var(--on-primary);
	}

	button:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
</style>
