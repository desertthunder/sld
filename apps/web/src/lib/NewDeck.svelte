<script lang="ts">
	import { tick } from 'svelte';
	import { splitDeck } from '#lib/deck-markdown.ts';
	import { slideCount } from '#lib/landing.ts';

	let {
		isReady,
		isCreating,
		oncreate
	}: { isReady: boolean; isCreating: boolean; oncreate: (markdown: string) => void } = $props();

	const placeholder = '# My talk\n\nFirst slide\n\n---\n\n## Second slide';

	const box = $state({ markdown: '' });
	const hasText = $derived(box.markdown.trim() !== '');
	const slides = $derived(hasText ? splitDeck(box.markdown).slides.length : 0);
	let field: HTMLTextAreaElement | undefined = $state();

	/** Whether the box holds text, which a paste elsewhere on the page must not replace. */
	export function hasDraft(): boolean {
		return box.markdown !== '';
	}

	/** Puts `markdown` in the box, in place of what it held, and moves focus there. */
	export async function fill(markdown: string) {
		box.markdown = markdown;
		await tick();
		field?.focus();
		field?.setSelectionRange(markdown.length, markdown.length);
	}

	function create() {
		if (isReady && !isCreating && slides > 0) oncreate(box.markdown);
	}
</script>

<section class="new-deck" aria-labelledby="new-deck-label">
	<label id="new-deck-label" for="new-deck">New deck</label>
	<p class="hint" id="new-deck-hint">
		Paste markdown anywhere on this page. A <code>---</code> line starts a new slide.
	</p>
	<textarea
		id="new-deck"
		class:filled={hasText}
		spellcheck="false"
		autocomplete="off"
		aria-describedby="new-deck-hint"
		{placeholder}
		bind:value={box.markdown}
		bind:this={field}></textarea>
	<div class="row">
		<button class="create" type="button" disabled={slides === 0 || !isReady || isCreating} onclick={create}>
			<span class="i-ri-add-line icon" aria-hidden="true"></span>Create deck
		</button>
		<span class="count" aria-live="polite">
			{#if hasText}<b>{slideCount(slides)}</b>{/if}
		</span>
	</div>
</section>

<style>
	.new-deck {
		position: relative;
		padding: 28px 28px 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.new-deck::before {
		content: '';
		position: absolute;
		left: -1px;
		right: -1px;
		top: -1px;
		height: 3px;
		background: var(--rule);
		border-radius: 12px 12px 0 0;
	}

	label {
		display: block;
		margin-bottom: 4px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 24px;
		line-height: 1.25;
		letter-spacing: -0.01em;
		color: var(--heading);
	}

	.hint {
		margin: 0 0 16px;
		font-size: 15px;
		color: var(--muted);
	}

	code {
		font-family: var(--code-font);
		font-size: 0.9em;
		color: var(--heading);
	}

	textarea {
		display: block;
		width: 100%;
		min-height: 204px;
		box-sizing: border-box;
		padding: 14px 16px;
		resize: vertical;
		background: var(--background);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-family: var(--code-font);
		font-size: 14px;
		line-height: 1.7;
		tab-size: 4;
	}

	textarea.filled {
		min-height: 260px;
	}

	textarea::placeholder {
		color: var(--muted);
		opacity: 0.8;
	}

	textarea:hover {
		border-color: color-mix(in oklab, var(--muted) 35%, var(--border));
	}

	textarea:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 16px;
	}

	.create {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 20px 0 16px;
		border: 0;
		border-radius: 10px;
		background: var(--link);
		color: var(--on-primary);
		font: 600 15px var(--ui-font);
		cursor: pointer;
	}

	.create:hover:not(:disabled) {
		background: color-mix(in oklab, var(--link) 88%, var(--heading));
	}

	.create:disabled {
		background: var(--border);
		color: var(--muted);
		cursor: not-allowed;
	}

	.create:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.icon {
		width: 18px;
		height: 18px;
	}

	.count {
		font-family: var(--code-font);
		font-size: 14px;
		color: var(--muted);
	}

	.count b {
		font-weight: 400;
		color: var(--heading);
	}

	@media (max-width: 640px) {
		.new-deck {
			padding: 22px 18px 18px;
		}

		label {
			font-size: 22px;
		}
	}
</style>
