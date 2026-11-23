<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import {
		countText,
		filterLabels,
		filterSchemes,
		lowContrastNote,
		lowContrastTip,
		matchSystemLabel,
		moveFocus,
		schemeFilters,
		searchPlaceholder,
		sortSchemes,
		swatchSlots,
		variantLabels,
		type SchemeFilter
	} from '#lib/scheme-choice.ts';
	import type { Scheme } from '#lib/scheme-compiler.ts';

	let {
		schemes,
		inUse,
		label,
		previewLabel,
		system,
		previewNote,
		focusOnMount = false,
		onuse,
		onclose,
		preview
	}: {
		schemes: readonly Scheme[];
		inUse: Scheme;
		/** The panel's heading, such as "Deck scheme". */
		label: string;
		/** What the preview shows, such as "Previewing on slide 3". */
		previewLabel: string;
		/**
		 * When given, the list starts with a "Match system" row that previews `scheme`, the default the system's preference
		 * picks, and calls `onuse` with undefined. `isInUse` says no scheme is chosen.
		 */
		system?: { scheme: Scheme; isInUse: boolean };
		/** What the preview header adds, such as why the preview keeps a scheme of its own. */
		previewNote?: string;
		focusOnMount?: boolean;
		/** Uses `scheme`, or follows the system again when it is undefined. */
		onuse: (scheme: Scheme | undefined) => void;
		/**
		 * Closes the panel, after Escape has put the scheme in use back or Enter has used one. Without it the panel has no
		 * Close button.
		 */
		onclose?: () => void;
		/** Draws the preview in the focused scheme. */
		preview: Snippet<[Scheme]>;
	} = $props();

	const id = $props.id();
	const listId = `${id}-list`;
	/** A row of the list: a scheme, or the "Match system" row, whose key no slug can take. */
	type Row = { key: string; name: string; scheme: Scheme; isSystem: boolean };
	const systemKey = ':system';
	const optionId = (row: Row) => `${id}-${row.key}`;

	const inUseKey = $derived(system?.isInUse ? systemKey : inUse.slug);
	const inUseName = $derived(system?.isInUse ? matchSystemLabel : inUse.name);
	const sorted = $derived(sortSchemes(schemes));
	// svelte-ignore state_referenced_locally
	const picker: { query: string; filter: SchemeFilter; active: string | undefined } = $state({
		query: '',
		filter: 'all',
		active: inUseKey
	});
	const isNarrowed = $derived(picker.query.trim() !== '' || picker.filter !== 'all');
	const shown: Row[] = $derived([
		...(system && !isNarrowed
			? [{ key: systemKey, name: matchSystemLabel, scheme: system.scheme, isSystem: true }]
			: []),
		...filterSchemes(sorted, picker.query, picker.filter).map((scheme) => ({
			key: scheme.slug,
			name: scheme.name,
			scheme,
			isSystem: false
		}))
	]);
	const schemeCount = $derived(shown.filter(({ isSystem }) => !isSystem).length);
	const activeIndex = $derived(shown.findIndex(({ key }) => key === picker.active));
	const focused = $derived(
		shown[activeIndex] ?? {
			key: inUseKey,
			name: inUseName,
			scheme: system?.isInUse ? system.scheme : inUse,
			isSystem: false
		}
	);

	let search: HTMLInputElement | undefined = $state();

	async function showActive(block: ScrollLogicalPosition = 'nearest') {
		await tick();
		const active = shown[activeIndex];
		if (active) document.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block });
	}

	/** Keeps the focused scheme when the list still shows it, and otherwise focuses the first one shown. */
	function narrow() {
		if (activeIndex === -1) picker.active = shown[0]?.key;
		void showActive();
	}

	function setFilter(filter: SchemeFilter) {
		picker.filter = filter;
		narrow();
	}

	function keep() {
		picker.active = inUseKey;
		if (onclose) onclose();
		else void showActive();
	}

	function use(row: Row | undefined) {
		if (!row) return;
		picker.active = row.key;
		onuse(row.isSystem ? undefined : row.scheme);
	}

	/** Handles the keys the search box and the list share, moving the focus with `moves`. */
	function handleKey(event: KeyboardEvent, moves: readonly string[]) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
		if (event.key === 'Escape') {
			keep();
		} else if (event.key === 'Enter') {
			const row = shown[activeIndex];
			if (!row) return;
			use(row);
			onclose?.();
		} else {
			const next = moves.includes(event.key) ? moveFocus(event.key, activeIndex, shown.length) : undefined;
			if (next === undefined) return;
			picker.active = shown[next]!.key;
			void showActive();
		}
		event.preventDefault();
	}

	function onsearchkeydown(event: KeyboardEvent) {
		handleKey(event, ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']);
	}

	function onlistkeydown(event: KeyboardEvent) {
		if (event.key === ' ' && !event.repeat) {
			event.preventDefault();
			use(shown[activeIndex]);
			return;
		}
		handleKey(event, ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);
	}

	onMount(() => {
		if (focusOnMount) search?.focus();
		void showActive('center');
	});
</script>

<div class="picker">
	<aside class="panel" aria-labelledby="{id}-heading">
		<div class="heading">
			<h2 id="{id}-heading">{label}</h2>
			{#if onclose}
				<button class="close" type="button" aria-label="Close" onclick={keep}>
					<span class="i-ri-close-line icon" aria-hidden="true"></span>
				</button>
			{/if}
		</div>
		<label class="search">
			<span class="i-ri-search-line icon" aria-hidden="true"></span>
			<input
				type="search"
				role="combobox"
				aria-label="Search schemes"
				aria-expanded="true"
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={activeIndex === -1 ? undefined : optionId(shown[activeIndex]!)}
				placeholder={searchPlaceholder(schemes.length)}
				autocomplete="off"
				spellcheck="false"
				bind:this={search}
				bind:value={picker.query}
				oninput={narrow}
				onkeydown={onsearchkeydown} />
		</label>
		<div class="filters" role="group" aria-label="Variant">
			{#each schemeFilters as filter (filter)}
				<button type="button" aria-pressed={picker.filter === filter} onclick={() => setFilter(filter)}>
					{filterLabels[filter]}
				</button>
			{/each}
		</div>
		<p class="count" aria-live="polite">{countText(schemeCount, schemes.length, isNarrowed)}</p>
		<ul
			class="list"
			id={listId}
			role="listbox"
			aria-label="Schemes"
			tabindex="0"
			aria-activedescendant={activeIndex === -1 ? undefined : optionId(shown[activeIndex]!)}
			onkeydown={onlistkeydown}>
			{#each shown as row, index (row.key)}
				{@const { scheme } = row}
				{@const isActive = index === activeIndex}
				<!-- The list handles the keys for its options, which take no focus of their own. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li class="option" id={optionId(row)} role="option" aria-selected={isActive} onclick={() => use(row)}>
					<span class="name">
						<span class="label">{row.name}</span>
						{#if row.key === inUseKey}
							<span class="in-use">
								<span class="i-ri-check-line icon" aria-hidden="true"></span><span class="sr">
									In use
								</span>
							</span>
						{/if}
					</span>
					<span class="marks">
						{#if scheme.lowContrast && !row.isSystem}
							<span class="weak">
								<span class="i-ri-alert-line icon" aria-hidden="true"></span>Low contrast
							</span>
						{/if}
						<span class="variant">{variantLabels[scheme.variant]}</span>
					</span>
					<span class="swatches" aria-hidden="true">
						{#each swatchSlots as slot (slot)}
							<i style:background={scheme.colors[`base${slot}`]}></i>
						{/each}
					</span>
					{#if isActive && scheme.lowContrast && !row.isSystem}
						<span class="tip">{lowContrastTip(scheme.name)}</span>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="keys">
			<span><kbd>↑</kbd> <kbd>↓</kbd> preview</span>
			<span><kbd>Enter</kbd> use</span>
			<span><kbd>Esc</kbd> keep {inUseName}</span>
		</p>
	</aside>
	<section class="preview" aria-label="Preview">
		<div class="preview-header" class:noted={previewNote}>
			<span class="previewing">{previewLabel} · {focused.name}</span>
			{#if previewNote}
				<span class="note">{previewNote}</span>
			{:else if focused.scheme.lowContrast}
				<span class="note"><span class="i-ri-alert-line icon" aria-hidden="true"></span>{lowContrastNote}</span>
			{/if}
		</div>
		<div class="preview-body">{@render preview(focused.scheme)}</div>
	</section>
</div>

<style>
	.picker {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 360px minmax(0, 1fr);
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--border);
		background: var(--bg);
	}

	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 40px;
		padding: 14px 12px 6px 18px;
	}

	h2 {
		margin: 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 18px;
		color: var(--heading);
	}

	.close {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.close:hover {
		background: var(--surface);
		color: var(--heading);
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	.search {
		position: relative;
		margin: 6px 14px 10px;
	}

	.search .icon {
		position: absolute;
		left: 12px;
		top: 13px;
		color: var(--muted);
	}

	input {
		width: 100%;
		box-sizing: border-box;
		height: 42px;
		padding: 0 12px 0 38px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--surface);
		color: var(--heading);
		font: 400 15px var(--ui-font);
	}

	input::placeholder {
		color: var(--muted);
	}

	.filters {
		display: flex;
		gap: 4px;
		margin: 0 14px 10px;
		padding: 3px;
		border-radius: 10px;
		background: var(--surface);
	}

	.filters button {
		flex: 1;
		min-height: 34px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--muted);
		font: 500 13.5px var(--ui-font);
		cursor: pointer;
	}

	.filters button[aria-pressed='true'] {
		background: var(--selection);
		color: var(--heading);
	}

	.count {
		margin: 0 18px 6px;
		font-size: 12.5px;
		color: var(--muted);
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		list-style: none;
		margin: 0;
		padding: 2px 10px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 10px;
		align-items: center;
		padding: 9px 10px;
		border: 2px solid transparent;
		border-radius: 10px;
		cursor: pointer;
	}

	.option:hover {
		background: var(--surface);
	}

	.option[aria-selected='true'] {
		background: var(--surface);
		border-color: var(--accent);
	}

	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		font-weight: 500;
		font-size: 14.5px;
		color: var(--heading);
	}

	.label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.in-use {
		flex: none;
		display: inline-flex;
		color: var(--link);
	}

	.marks {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.weak {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: var(--muted);
	}

	.weak .icon,
	.note .icon {
		width: 13px;
		height: 13px;
		color: var(--danger);
	}

	.variant {
		flex: none;
		padding: 0 7px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 11.5px;
		font-weight: 600;
		color: var(--muted);
	}

	.swatches {
		grid-column: 1 / -1;
		display: flex;
		gap: 3px;
	}

	.swatches i {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--body) 14%, transparent);
	}

	.tip {
		grid-column: 1 / -1;
		margin-top: 4px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--bg);
		font-size: 13px;
		line-height: 1.45;
		color: var(--body);
	}

	.keys {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		font-size: 12.5px;
		color: var(--muted);
	}

	kbd {
		padding: 0 5px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 5px;
		font-family: inherit;
		font-size: 11.5px;
		color: var(--heading);
	}

	.preview {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.preview-header {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 40px;
		padding: 0 16px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
		color: var(--muted);
	}

	.note {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--heading);
	}

	.preview-body {
		flex: 1;
		min-height: 0;
		display: grid;
		padding: 32px;
		background: var(--surface);
	}

	/* The stage sits on the surface, lifted by a shadow, and the frame around it shows no bars of its own. */
	.preview-body :global(.frame) {
		overflow: visible;
		background: transparent;
	}

	.preview-body :global(.stage) {
		box-shadow:
			0 2px 3px var(--shadow),
			0 16px 36px var(--shadow);
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

	.close:focus-visible,
	.filters button:focus-visible,
	input:focus-visible,
	.list:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.list:focus-visible {
		outline-offset: -3px;
	}

	@media (max-width: 760px) {
		.picker {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
		}

		.preview {
			order: -1;
		}

		.preview-header:not(.noted),
		.preview-header .previewing,
		.keys {
			display: none;
		}

		.preview-body {
			flex: none;
			height: min(56vw, 40vh);
			padding: 14px 16px;
		}

		.panel {
			border-right: 0;
			border-top: 1px solid var(--border);
		}
	}
</style>
