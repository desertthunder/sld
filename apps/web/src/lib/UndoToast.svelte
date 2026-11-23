<script lang="ts">
	import { onMount } from 'svelte';

	let {
		message,
		lifetime = 10_000,
		onundo,
		ondismiss
	}: { message: string; lifetime?: number; onundo: () => void; ondismiss: (wasByKey: boolean) => void } = $props();

	let toast: HTMLElement | undefined = $state();
	let undoButton: HTMLButtonElement | undefined = $state();
	const timer: { id?: ReturnType<typeof setTimeout>; isHeld: boolean } = { isHeld: false };

	function start() {
		clearTimeout(timer.id);
		timer.id = setTimeout(() => ondismiss(false), lifetime);
	}

	// The toast stays while the pointer or focus is on it, so its Undo can't vanish from under a person reaching it.
	function hold() {
		clearTimeout(timer.id);
	}

	function release(event?: FocusEvent) {
		if (event && toast?.contains(event.relatedTarget as Node | null)) return;
		if (toast?.matches(':hover') || toast?.contains(document.activeElement)) return;
		start();
	}

	/** Moves focus to the Undo button. */
	export function focus() {
		undoButton?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		ondismiss(true);
	}

	onMount(() => {
		start();
		return hold;
	});
</script>

<!-- The toast is a group, not a control: these listeners only hold it open and let Escape close it. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="toast"
	role="group"
	aria-label={message}
	bind:this={toast}
	onpointerenter={hold}
	onpointerleave={() => release()}
	onfocusin={hold}
	onfocusout={release}
	{onkeydown}>
	<span class="message">{message}</span>
	<button type="button" bind:this={undoButton} onclick={onundo}>Undo</button>
</div>

<style>
	.toast {
		display: flex;
		align-items: center;
		gap: 20px;
		max-width: min(560px, calc(100vw - 32px));
		padding: 8px 8px 8px 20px;
		box-sizing: border-box;
		background: var(--heading);
		color: var(--bg);
		border-radius: 12px;
		box-shadow:
			0 4px 8px var(--shadow),
			0 18px 40px var(--shadow);
		font-weight: 500;
		font-size: 15px;
		pointer-events: auto;
	}

	.message {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	button {
		flex: none;
		min-height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--bg);
		font: 700 15px var(--ui-font);
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}

	button:hover {
		background: color-mix(in oklab, var(--bg) 14%, transparent);
	}

	/* The toast inverts the page's colors, so the page background is what stands out on it. */
	button:focus-visible {
		outline: 3px solid var(--bg);
		outline-offset: 1px;
	}

	@media (max-width: 640px) {
		.toast {
			width: 100%;
			max-width: none;
		}
	}
</style>
