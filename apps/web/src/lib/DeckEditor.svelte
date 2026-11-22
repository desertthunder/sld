<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { appName } from '#lib/app-info.ts';
	import type { Database } from '#lib/database.ts';
	import {
		canDeleteSlide,
		clampPaneWidths,
		defaultPaneWidths,
		editorTabKey,
		editorTabs,
		indexAfterDelete,
		paneLimits,
		paneWidthsKey,
		parseEditorTab,
		parsePaneWidths,
		phoneWidth,
		selectedIndex,
		slideParameter,
		slideParameterValue,
		tabLabels,
		type EditorTab,
		type PaneWidths
	} from '#lib/deck-editor.ts';
	import {
		deleteSlide,
		duplicateSlide,
		getDeck,
		insertSlide,
		renameDeck,
		updateSlide,
		type DeckWithSlides
	} from '#lib/decks.ts';
	import DeckTitle from '#lib/DeckTitle.svelte';
	import EditorFrame from '#lib/EditorFrame.svelte';
	import PaneHandle from '#lib/PaneHandle.svelte';
	import SlideList from '#lib/SlideList.svelte';
	import { createSlideSaver, saveStatusLabels, type SaveStatus } from '#lib/slide-saver.ts';

	let { database, deck, onmissing }: { database: Database; deck: DeckWithSlides; onmissing: () => void } = $props();

	function readStored(storage: () => Storage, key: string): string | undefined {
		try {
			return storage().getItem(key) ?? undefined;
		} catch {
			return undefined;
		}
	}

	function writeStored(storage: () => Storage, key: string, value: string) {
		try {
			storage().setItem(key, value);
		} catch {
			// Storage can be full or blocked; the layout then lasts only as long as the page.
		}
	}

	// The deck is loaded once; from here on this state is the source, and every change is written through.
	// svelte-ignore state_referenced_locally
	const { id: deckId, title, slides } = deck;
	const editor: {
		title: string;
		slides: { id: string; markdown: string }[];
		selected: number;
		status: SaveStatus;
		announcement: string;
		widths: PaneWidths;
		tab: EditorTab;
	} = $state({
		title,
		slides: slides.map(({ id, markdown }) => ({ id, markdown })),
		selected: selectedIndex(page.url.searchParams.get(slideParameter) ?? undefined, slides.length),
		status: 'saved',
		announcement: '',
		widths: parsePaneWidths(readStored(() => localStorage, paneWidthsKey)),
		tab: parseEditorTab(readStored(() => sessionStorage, editorTabKey))
	});
	const current = $derived(editor.slides[editor.selected]!);
	const changing = { isBusy: false };

	const saver = createSlideSaver({
		save: (id, markdown) => updateSlide(database, id, markdown),
		onStatus: (status) => (editor.status = status),
		delay: 400
	});

	const phone = new MediaQuery(`max-width: ${phoneWidth}px`);
	let body: HTMLElement | undefined = $state();
	let listPane: HTMLElement | undefined = $state();

	const columns = $derived.by(() => {
		const { list, editor: share } = editor.widths;
		return `min(${list}px, 40%) 6px minmax(0, ${share * 100}fr) 6px minmax(0, ${(1 - share) * 100}fr)`;
	});

	function showSelectedInUrl() {
		const href = `${resolve('/app/deck/[id]', { id: deckId })}?${slideParameter}=${slideParameterValue(editor.selected)}`;
		if (href === `${location.pathname}${location.search}`) return;
		// `resolve` builds the path, and the rule doesn't follow it into a string with a query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(href, page.state);
	}

	function select(index: number, shouldOpen = false) {
		editor.selected = Math.min(Math.max(index, 0), editor.slides.length - 1);
		showSelectedInUrl();
		if (shouldOpen && phone.current) chooseTab('edit');
	}

	function chooseTab(tab: EditorTab) {
		editor.tab = tab;
		writeStored(() => sessionStorage, editorTabKey, tab);
	}

	async function announce(message: string) {
		editor.announcement = '';
		await tick();
		editor.announcement = message;
	}

	async function refresh(index: number) {
		const stored = await getDeck(database, deckId);
		if (!stored) {
			onmissing();
			return;
		}
		editor.slides = stored.slides.map(({ id, markdown }) => ({ id, markdown: saver.pending(id) ?? markdown }));
		select(index);
	}

	/** Runs one change to the deck's slides at a time, after the edits before it are written. */
	async function change(write: () => Promise<number | undefined>, message: (index: number) => string) {
		if (changing.isBusy) return;
		changing.isBusy = true;
		try {
			const index = await saver.run(write);
			// Another tab changed the deck first, so show what is stored.
			if (index === undefined) {
				await refresh(editor.selected);
				return;
			}
			await refresh(index);
			await announce(message(index));
		} catch {
			// The saver reports the failure as the status.
		} finally {
			changing.isBusy = false;
		}
	}

	function addSlide() {
		const at = editor.selected + 1;
		return change(
			async () => ((await insertSlide(database, deckId, at, '')) ? at : undefined),
			(index) => `Added slide ${index + 1}.`
		);
	}

	function duplicateSelected() {
		const { id } = current;
		const from = editor.selected;
		return change(
			async () => ((await duplicateSlide(database, id)) ? from + 1 : undefined),
			(index) => `Duplicated slide ${from + 1} as slide ${index + 1}.`
		);
	}

	async function deleteSelected() {
		const count = editor.slides.length;
		if (!canDeleteSlide(count)) return;
		const { id } = current;
		const from = editor.selected;
		await change(
			async () => ((await deleteSlide(database, id)) ? indexAfterDelete(from, count) : undefined),
			() => `Deleted slide ${from + 1}.`
		);
	}

	async function rename(next: string) {
		editor.title = next;
		try {
			await saver.run(() => renameDeck(database, deckId, next));
		} catch {
			// The saver reports the failure as the status.
		}
	}

	function edit(event: Event & { currentTarget: HTMLTextAreaElement }) {
		const { value } = event.currentTarget;
		current.markdown = value;
		saver.edit(current.id, value);
	}

	async function flush() {
		try {
			await saver.flush();
		} catch {
			// The saver reports the failure as the status.
		}
	}

	function saveWidths() {
		writeStored(() => localStorage, paneWidthsKey, JSON.stringify(editor.widths));
	}

	function setWidths(widths: Partial<PaneWidths>) {
		editor.widths = clampPaneWidths({ ...editor.widths, ...widths });
	}

	function stepList(step: -1 | 1 | 'min' | 'max') {
		const { min, max, step: size } = paneLimits.list;
		const shown = listPane?.offsetWidth ?? editor.widths.list;
		setWidths({ list: step === 'min' ? min : step === 'max' ? max : shown + step * size });
	}

	function stepEditor(step: -1 | 1 | 'min' | 'max') {
		const { min, max, step: size } = paneLimits.editor;
		setWidths({ editor: step === 'min' ? min : step === 'max' ? max : editor.widths.editor + step * size });
	}

	function dragList(clientX: number) {
		if (body) setWidths({ list: clientX - body.getBoundingClientRect().left });
	}

	function dragEditor(clientX: number) {
		if (!body || !listPane) return;
		const box = body.getBoundingClientRect();
		const start = box.left + listPane.offsetWidth + 6;
		const room = box.width - listPane.offsetWidth - 12;
		if (room > 0) setWidths({ editor: (clientX - start - 3) / room });
	}

	function resetWidth(key: keyof PaneWidths) {
		setWidths({ [key]: defaultPaneWidths[key] });
		saveWidths();
	}

	const tabMoves: Record<string, (index: number) => number> = {
		ArrowLeft: (index) => (index + editorTabs.length - 1) % editorTabs.length,
		ArrowRight: (index) => (index + 1) % editorTabs.length,
		Home: () => 0,
		End: () => editorTabs.length - 1
	};

	async function ontabkeydown(event: KeyboardEvent) {
		const move = Object.hasOwn(tabMoves, event.key) ? tabMoves[event.key] : undefined;
		if (!move) return;
		event.preventDefault();
		const tab = editorTabs[move(editorTabs.indexOf(editor.tab))]!;
		chooseTab(tab);
		await tick();
		document.querySelector<HTMLElement>(`#tab-${tab}`)?.focus();
	}

	const paneIds: Record<EditorTab, string> = { slides: 'pane-slides', edit: 'pane-edit', preview: 'pane-preview' };
	const panelIds: Record<EditorTab, string> = { ...paneIds, slides: 'panel-slides' };

	/** The panes are tab panels only while they show as tabs. */
	function panel(tab: EditorTab) {
		return phone.current ? { role: 'tabpanel', 'aria-labelledby': `tab-${tab}` } : {};
	}

	onMount(() => {
		showSelectedInUrl();
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') void flush();
		};
		addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			saver.stop();
			void flush();
		};
	});
</script>

<svelte:head>
	<title>{editor.title.trim() || 'Untitled deck'} · {appName}</title>
</svelte:head>

{#snippet toolbar()}
	<DeckTitle title={editor.title} onrename={rename} />
	<span class="saved" class:failed={editor.status === 'failed'}>{saveStatusLabels[editor.status]}</span>
	<span class="spacer"></span>
	<!-- TODO: open the presenter at the selected slide, from this button and the P key, once it exists. -->
	<button class="present" type="button" disabled aria-keyshortcuts="P">
		<span class="i-ri-play-line icon" aria-hidden="true"></span>Present<kbd>P</kbd>
	</button>
{/snippet}

<EditorFrame {toolbar}>
	<div class="tabs" role="tablist" aria-label="Editor panes">
		{#each editorTabs as name (name)}
			<button
				class="tab"
				type="button"
				role="tab"
				id="tab-{name}"
				aria-selected={editor.tab === name}
				aria-controls={panelIds[name]}
				tabindex={editor.tab === name ? 0 : -1}
				onclick={() => chooseTab(name)}
				onkeydown={ontabkeydown}>
				{tabLabels[name]}
			</button>
		{/each}
	</div>
	<div class="body" style:--columns={columns} bind:this={body}>
		<div
			class="pane-slot"
			class:away={editor.tab !== 'slides'}
			id={panelIds.slides}
			{...panel('slides')}
			bind:this={listPane}>
			<SlideList
				id={paneIds.slides}
				slides={editor.slides}
				selected={editor.selected}
				announcement={editor.announcement}
				onselect={select}
				onadd={addSlide}
				onduplicate={duplicateSelected}
				ondelete={deleteSelected} />
		</div>
		<PaneHandle
			label="Resize slide list"
			value={editor.widths.list}
			min={paneLimits.list.min}
			max={paneLimits.list.max}
			valueText="{editor.widths.list} pixels"
			controls={paneIds.slides}
			onstep={stepList}
			ondrag={dragList}
			ondone={saveWidths}
			onreset={() => resetWidth('list')} />
		<section
			class="pane"
			class:away={editor.tab !== 'edit'}
			id={paneIds.edit}
			aria-label="Markdown"
			{...panel('edit')}>
			<div class="pane-header"><span>Slide {editor.selected + 1} · markdown</span></div>
			<!-- TODO: replace the text area with the CodeMirror editor. -->
			<textarea
				spellcheck="false"
				aria-label="Markdown for slide {editor.selected + 1}"
				value={current.markdown}
				oninput={edit}
				onblur={() => void flush()}></textarea>
		</section>
		<PaneHandle
			label="Resize editor and preview"
			value={Math.round(editor.widths.editor * 100)}
			min={paneLimits.editor.min * 100}
			max={paneLimits.editor.max * 100}
			valueText="Editor {Math.round(editor.widths.editor * 100)} percent"
			controls={paneIds.edit}
			onstep={stepEditor}
			ondrag={dragEditor}
			ondone={saveWidths}
			onreset={() => resetWidth('editor')} />
		<section
			class="pane"
			class:away={editor.tab !== 'preview'}
			id={paneIds.preview}
			aria-label="Preview"
			{...panel('preview')}>
			<div class="pane-header"><span>Preview</span></div>
			<!-- TODO: draw the selected slide here. -->
			<div class="preview"></div>
		</section>
	</div>
</EditorFrame>

<style>
	.saved {
		flex: none;
		font-size: 13px;
		color: var(--muted);
	}

	.saved.failed {
		color: var(--heading);
		font-weight: 600;
	}

	.spacer {
		flex: 1;
	}

	.present {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 9px;
		background: var(--link);
		color: var(--on-primary);
		font: 600 14px var(--ui-font);
		cursor: pointer;
	}

	.present:disabled {
		background: var(--surface);
		color: var(--muted);
		cursor: not-allowed;
	}

	.present kbd {
		font-family: var(--code-font);
		font-size: 11px;
		border: 1px solid currentColor;
		border-radius: 4px;
		padding: 0 5px;
		opacity: 0.75;
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	.present:focus-visible,
	.tab:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}

	.present:focus-visible {
		outline-offset: 2px;
	}

	.tabs {
		display: none;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: var(--columns);
	}

	.pane-slot {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.pane-slot > :global(*) {
		flex: 1;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.pane-header {
		flex: none;
		display: flex;
		align-items: center;
		height: 40px;
		padding: 0 16px;
		font-size: 13px;
		color: var(--muted);
		border-bottom: 1px solid var(--border);
	}

	textarea {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 20px 24px;
		border: 0;
		resize: none;
		background: var(--background);
		color: var(--text);
		font-family: var(--code-font);
		font-size: 14px;
		line-height: 1.75;
		tab-size: 4;
	}

	textarea:focus {
		outline: none;
	}

	.preview {
		flex: 1;
		background: var(--surface);
	}

	@media (max-width: 760px) {
		.saved:not(.failed),
		.present kbd {
			display: none;
		}

		.present {
			padding: 0 14px;
		}

		.tabs {
			flex: none;
			display: flex;
			border-bottom: 1px solid var(--border);
		}

		.tab {
			flex: 1;
			min-width: 0;
			min-height: 44px;
			border: 0;
			border-bottom: 2px solid transparent;
			background: transparent;
			color: var(--muted);
			font: 600 14px var(--ui-font);
			cursor: pointer;
		}

		.tab:hover {
			color: var(--heading);
		}

		.tab[aria-selected='true'] {
			color: var(--heading);
			border-bottom-color: var(--accent);
		}

		.body {
			grid-template-columns: minmax(0, 1fr);
		}

		.body > :global([role='separator']),
		.away {
			display: none;
		}

		textarea {
			padding: 16px;
		}
	}
</style>
