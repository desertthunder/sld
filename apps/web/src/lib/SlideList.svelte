<script lang="ts">
	import { tick } from 'svelte';
	import { canDeleteSlide, listCommand, listKeysHint } from '#lib/deck-editor.ts';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { slideLabel } from '#lib/slide-label.ts';
	import { readListView, writeListView, type ListView } from '#lib/slide-list-view.ts';
	import SlideThumb from '#lib/SlideThumb.svelte';
	import type { Aspect } from '#lib/stage.ts';

	let {
		id,
		slides,
		aspect,
		scheme,
		schemes,
		selected,
		announcement,
		onselect,
		onadd,
		onduplicate,
		ondelete
	}: {
		id: string;
		slides: readonly { id: string; markdown: string }[];
		aspect: Aspect;
		/** The deck's scheme, which a slide's own `scheme` replaces when it names one of `schemes`. */
		scheme?: Scheme;
		schemes?: readonly Scheme[];
		selected: number;
		announcement: string;
		/** `shouldOpen` is true when the slide was picked to edit it, not only moved to with the arrow keys. */
		onselect: (index: number, shouldOpen: boolean) => void;
		onadd: () => Promise<void>;
		onduplicate: () => Promise<void>;
		ondelete: () => Promise<void>;
	} = $props();

	let items: HTMLOListElement | undefined = $state();
	const display: { view: ListView } = $state({ view: readListView(() => localStorage) });

	function show(view: ListView) {
		display.view = view;
		writeListView(() => localStorage, view);
	}
	const canDelete = $derived(canDeleteSlide(slides.length));

	async function focusSelected() {
		await tick();
		items?.querySelector<HTMLButtonElement>(`[data-index="${CSS.escape(String(selected))}"]`)?.focus();
	}

	async function act(action: () => Promise<void>) {
		await action();
		await focusSelected();
	}

	function choose(index: number) {
		onselect(Math.min(Math.max(index, 0), slides.length - 1), false);
		void focusSelected();
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('input, textarea, [contenteditable]')) return;
		const command = listCommand(event);
		if (!command) return;
		const isOnItem = target.matches('[data-index]');
		if (!isOnItem && ['previous', 'next', 'first', 'last'].includes(command)) return;
		event.preventDefault();
		switch (command) {
			case 'previous': {
				choose(selected - 1);
				break;
			}
			case 'next': {
				choose(selected + 1);
				break;
			}
			case 'first': {
				choose(0);
				break;
			}
			case 'last': {
				choose(slides.length - 1);
				break;
			}
			case 'add': {
				void act(onadd);
				break;
			}
			case 'duplicate': {
				void act(onduplicate);
				break;
			}
			case 'delete': {
				if (canDelete) void act(ondelete);
				break;
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav class="list" class:thumbnails={display.view === 'thumbnails'} {id} aria-label="Slides" {onkeydown}>
	<div class="header">
		<span><b>Slides</b> · {slides.length}</span>
		<span class="views">
			<button
				class="icon-button"
				type="button"
				aria-label="Show thumbnails"
				aria-pressed={display.view === 'thumbnails'}
				onclick={() => show('thumbnails')}>
				<span class="i-ri-layout-row-line icon" aria-hidden="true"></span>
			</button>
			<button
				class="icon-button"
				type="button"
				aria-label="Show headings only"
				aria-pressed={display.view === 'headings'}
				onclick={() => show('headings')}>
				<span class="i-ri-menu-line icon" aria-hidden="true"></span>
			</button>
		</span>
	</div>
	<ol class="items" aria-describedby="{id}-keys" bind:this={items}>
		{#each slides as slide, index (slide.id)}
			{@const isCurrent = index === selected}
			<li class:current={isCurrent}>
				<button
					class="item"
					type="button"
					data-index={index}
					tabindex={isCurrent ? 0 : -1}
					aria-current={isCurrent ? 'true' : undefined}
					onclick={() => onselect(index, true)}>
					<span class="number"><span class="sr">Slide</span> {index + 1}</span>
					<span class="label">{slideLabel(slide.markdown)}</span>
					{#if display.view === 'thumbnails'}
						<SlideThumb slideId={slide.id} markdown={slide.markdown} {aspect} {scheme} {schemes} />
					{/if}
				</button>
				{#if isCurrent}
					<span class="actions">
						<button
							class="icon-button"
							type="button"
							aria-label="Duplicate slide {index + 1}"
							aria-keyshortcuts="D"
							onclick={() => act(onduplicate)}>
							<span class="i-ri-file-copy-line icon" aria-hidden="true"></span>
						</button>
						<button
							class="icon-button"
							type="button"
							aria-label="Delete slide {index + 1}"
							aria-keyshortcuts="Delete"
							disabled={!canDelete}
							onclick={() => act(ondelete)}>
							<span class="i-ri-delete-bin-line icon" aria-hidden="true"></span>
						</button>
					</span>
				{/if}
			</li>
		{/each}
	</ol>
	<p id="{id}-keys" class="sr">{listKeysHint}</p>
	<p class="sr" role="status" aria-live="polite">{announcement}</p>
	<button class="add" type="button" aria-keyshortcuts="N" onclick={() => act(onadd)}>
		<span class="i-ri-add-line icon" aria-hidden="true"></span>New slide
	</button>
</nav>

<style>
	.list {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 40px;
		padding: 0 10px 0 16px;
		font-size: 13px;
		color: var(--muted);
	}

	.views {
		display: flex;
		gap: 2px;
	}

	.views .icon-button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--heading);
	}

	.header b {
		font-weight: 600;
		color: var(--heading);
	}

	.items {
		flex: 1;
		overflow: auto;
		list-style: none;
		margin: 0;
		padding: 4px 10px 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	li {
		position: relative;
	}

	.item {
		display: grid;
		grid-template-columns: 26px minmax(0, 1fr);
		gap: 8px;
		align-items: baseline;
		width: 100%;
		min-height: 44px;
		padding: 8px 10px 8px 4px;
		box-sizing: border-box;
		text-align: left;
		border: 2px solid transparent;
		border-radius: 10px;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.item:hover {
		background: var(--surface);
	}

	.current .item {
		padding-right: 78px;
		background: var(--surface);
		border-color: var(--accent);
	}

	.thumbnails .item {
		align-items: start;
	}

	.thumbnails .current .item {
		padding-right: 10px;
	}

	.thumbnails .label {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.thumbnails .actions {
		top: 14px;
		right: 14px;
		transform: none;
	}

	.number {
		font-family: var(--code-font);
		font-size: 12px;
		color: var(--muted);
		text-align: right;
	}

	.label {
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 14.5px;
		color: var(--heading);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.actions {
		position: absolute;
		right: 7px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.icon-button {
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--body);
		cursor: pointer;
	}

	.icon-button:hover:not(:disabled) {
		background: var(--surface);
		color: var(--heading);
	}

	.icon-button:disabled {
		color: color-mix(in oklab, var(--muted) 45%, var(--bg));
		cursor: not-allowed;
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	.add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		margin: 4px 10px 12px;
		min-height: 40px;
		border: 1px dashed var(--border);
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font: 500 14px var(--ui-font);
		cursor: pointer;
	}

	.add:hover {
		color: var(--heading);
		border-color: var(--muted);
	}

	.item:focus-visible,
	.icon-button:focus-visible,
	.add:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 760px) {
		.item {
			min-height: 48px;
		}

		.icon-button {
			width: 36px;
			height: 36px;
		}

		.current .item {
			padding-right: 90px;
		}

		.thumbnails .current .item {
			padding-right: 10px;
		}
	}
</style>
