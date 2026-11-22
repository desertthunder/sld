<script lang="ts">
	import { tick } from 'svelte';

	let { title, onrename }: { title: string; onrename: (title: string) => void } = $props();

	const untitled = 'Untitled deck';
	const shown = $derived(title.trim() || untitled);
	const field = $state({ isEditing: false, draft: '' });
	let input: HTMLInputElement | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();

	async function start() {
		field.draft = title;
		field.isEditing = true;
		await tick();
		input?.select();
	}

	/** Ends editing. Only a key takes focus back to the title: a blur leaves it where the person moved it. */
	async function finish(shouldRename: boolean, shouldFocus: boolean) {
		if (!field.isEditing) return;
		field.isEditing = false;
		const next = field.draft.trim();
		if (shouldRename && next && next !== title) onrename(next);
		if (!shouldFocus) return;
		await tick();
		button?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void finish(true, true);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			void finish(false, true);
		}
	}
</script>

{#if field.isEditing}
	<input
		class="title"
		type="text"
		aria-label="Deck title"
		spellcheck="false"
		autocomplete="off"
		size={Math.min(Math.max(field.draft.length, 8), 40)}
		bind:value={field.draft}
		bind:this={input}
		{onkeydown}
		onblur={() => void finish(true, false)} />
{:else}
	<button
		class="title"
		type="button"
		aria-label="Rename deck: {shown}"
		title={shown}
		bind:this={button}
		onclick={start}>
		<span class="text">{shown}</span>
		<span class="i-ri-pencil-line icon" aria-hidden="true"></span>
	</button>
{/if}

<style>
	.title {
		min-width: 0;
		max-width: 40ch;
		padding: 6px 10px;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--heading);
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 19px;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: text;
	}

	button.title {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.icon {
		width: 16px;
		height: 16px;
		color: var(--muted);
	}

	button.title:hover {
		border-color: var(--border);
	}

	input.title {
		border-color: var(--border);
		background: var(--surface);
		text-overflow: clip;
	}

	.title:focus-visible,
	input.title:focus {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	@media (max-width: 760px) {
		.title {
			flex: 1 1 auto;
			max-width: none;
			padding: 6px 8px;
			font-size: 17px;
		}

		input.title {
			width: 0;
		}
	}
</style>
