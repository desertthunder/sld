<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
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
	import { applyDeckChanges, getDeck, type DeckChange, type DeckWithSlides } from '#lib/decks.ts';
	import DeckTitle from '#lib/DeckTitle.svelte';
	import EditorFrame from '#lib/EditorFrame.svelte';
	import LeaveDialog from '#lib/LeaveDialog.svelte';
	import PaneHandle from '#lib/PaneHandle.svelte';
	import { hashForSlide } from '#lib/presenter-navigation.ts';
	import SlideList from '#lib/SlideList.svelte';
	import SlidePreview from '#lib/SlidePreview.svelte';
	import type { Notice } from '#lib/slide-notices.ts';
	import { createSlideSaver, saveStatusLabels, type SaveStatus, type SaverEntry } from '#lib/slide-saver.ts';
	import SlideWarnings from '#lib/SlideWarnings.svelte';
	import { deckAspect } from '#lib/stage.ts';

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

	// UnoCSS finds icon classes in the component source, so the names stay whole here.
	const saveStatusIcons: Record<SaveStatus, string> = {
		saved: 'i-ri-check-line',
		saving: 'i-ri-loader-4-line',
		failed: 'i-ri-error-warning-line'
	};

	// The deck is loaded once; from here on this state is the source, and every change is written through.
	// svelte-ignore state_referenced_locally
	const { id: deckId, title, slides } = deck;
	// svelte-ignore state_referenced_locally
	const aspect = deckAspect(deck.aspect);
	let notices: readonly Notice[] = $state([]);
	type SlideItem = { id: string; markdown: string };
	const editor: {
		title: string;
		slides: SlideItem[];
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
	// The slides as last known to be stored, to go back to when a change fails and the deck can't be read. A change
	// shows at once and waits its turn to be written; `generation` moves on whenever the list is replaced by what is
	// stored, so the changes still waiting, made to the list that was replaced, are dropped. `takenBack` holds the edits
	// of a failed batch to the new slides it took back: the saver queues them again, and they were reported already.
	const changes: { stored: SlideItem[]; generation: number; isDestroyed: boolean; takenBack: Map<string, string> } = {
		stored: slides.map(({ id, markdown }) => ({ id, markdown })),
		generation: 0,
		isDestroyed: false,
		takenBack: new Map()
	};

	// A change to the slides carries the generation it was made in, so a refresh since drops it, and the list it leaves.
	type QueuedChange = { change: DeckChange; generation?: number; list?: SlideItem[] };

	/** Writes a batch of edits and changes in one transaction, resolving to whether nothing in it was lost. */
	async function didStoreBatch(entries: SaverEntry<QueuedChange>[]): Promise<boolean> {
		const batch: QueuedChange[] = [];
		let isDropped = false;
		for (const entry of entries) {
			if (entry.kind === 'edit' && changes.takenBack.get(entry.id) === entry.markdown) {
				changes.takenBack.delete(entry.id);
				continue;
			}
			if (entry.kind === 'edit') {
				batch.push({ change: { kind: 'update', id: entry.id, markdown: entry.markdown } });
			} else if (entry.change.generation === undefined || entry.change.generation === changes.generation) {
				batch.push(entry.change);
			} else {
				isDropped = true;
			}
		}
		if (batch.length === 0) return !isDropped;
		let applied: boolean[];
		try {
			applied = await applyDeckChanges(
				database,
				deckId,
				batch.map(({ change }) => change)
			);
		} catch (error) {
			if (batch.some(({ list }) => list)) await refresh();
			const shown = new Set(editor.slides.map(({ id }) => id));
			for (const entry of entries) {
				if (entry.kind === 'edit' && !shown.has(entry.id)) changes.takenBack.set(entry.id, entry.markdown);
			}
			throw error;
		}
		const first = applied.indexOf(false);
		if (first === -1) {
			const list = batch.findLast(({ list }) => list)?.list;
			if (list) changes.stored = list;
			return !isDropped;
		}
		// Another tab changed the deck first, so show what is stored. A change that tab already made isn't lost, but an
		// edit to a gone slide is, and so are the changes skipped after it.
		await refresh();
		return !isDropped && batch[first]!.change.kind !== 'update' && !applied.slice(first + 1).includes(false);
	}

	const saver = createSlideSaver<QueuedChange>({
		commit: didStoreBatch,
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

	/**
	 * Shows `list` in place of the slides, keeping the selected slide selected while it is there. Edits not yet written
	 * stay, and so does the markdown on screen when `list` was not just read from the database.
	 */
	function show(list: readonly SlideItem[], isRead: boolean) {
		const selectedId = current.id;
		const shown = new Map(editor.slides.map(({ id, markdown }) => [id, markdown]));
		editor.slides = list.map(({ id, markdown }) => ({
			id,
			markdown: saver.pending(id) ?? (isRead ? undefined : shown.get(id)) ?? markdown
		}));
		changes.generation++;
		const index = editor.slides.findIndex(({ id }) => id === selectedId);
		select(index === -1 ? editor.selected : index);
	}

	/**
	 * Shows what is stored, or the slides last known to be stored when the deck can't be read. Call it only from a
	 * write in the saver's queue, so no other write lands between the read and the list it shows.
	 */
	async function refresh() {
		// A change can fail after the editor is gone, and showing the deck then would put it back in the URL.
		if (changes.isDestroyed) return;
		let stored: DeckWithSlides | undefined;
		try {
			stored = await getDeck(database, deckId);
		} catch {
			if (!changes.isDestroyed) show(changes.stored, false);
			return;
		}
		if (changes.isDestroyed) return;
		if (!stored) {
			onmissing();
			return;
		}
		changes.stored = stored.slides.map(({ id, markdown }) => ({ id, markdown }));
		show(changes.stored, true);
	}

	/**
	 * Shows `list` with the slide at `index` selected at once, then writes the change after the writes before it. When
	 * the write fails, or another tab changed the deck first, the list goes back to what is stored.
	 */
	async function change(list: SlideItem[], index: number, message: string, write: DeckChange) {
		const { generation } = changes;
		editor.slides = list;
		select(index);
		void saver.change({ change: write, generation, list: list.map(({ id, markdown }) => ({ id, markdown })) });
		await announce(message);
	}

	function addSlide() {
		const at = editor.selected + 1;
		const id = crypto.randomUUID();
		return change(editor.slides.toSpliced(at, 0, { id, markdown: '' }), at, `Added slide ${at + 1}.`, {
			kind: 'insert',
			id,
			position: at,
			markdown: ''
		});
	}

	function duplicateSelected() {
		const { id, markdown } = current;
		const from = editor.selected;
		const copy = crypto.randomUUID();
		return change(
			editor.slides.toSpliced(from + 1, 0, { id: copy, markdown }),
			from + 1,
			`Duplicated slide ${from + 1} as slide ${from + 2}.`,
			{ kind: 'duplicate', of: id, id: copy, markdown }
		);
	}

	async function deleteSelected() {
		const count = editor.slides.length;
		if (!canDeleteSlide(count)) return;
		const { id } = current;
		const from = editor.selected;
		await change(editor.slides.toSpliced(from, 1), indexAfterDelete(from, count), `Deleted slide ${from + 1}.`, {
			kind: 'delete',
			id
		});
	}

	async function rename(next: string) {
		editor.title = next;
		await saver.change({ change: { kind: 'rename', title: next } });
	}

	function edit(event: Event & { currentTarget: HTMLTextAreaElement }) {
		const { value } = event.currentTarget;
		current.markdown = value;
		saver.edit(current.id, value);
	}

	function flush() {
		return saver.flush();
	}

	function warnBeforeUnload(event: BeforeUnloadEvent) {
		event.preventDefault();
		// Older browsers ask only when `returnValue` is set.
		event.returnValue = true;
	}

	// The browser asks before closing or reloading the page while a change isn't stored. The listener is there only
	// then, since one that is always there keeps the page out of the back-forward cache in some browsers.
	$effect(() => {
		if (editor.status === 'saved') return;
		addEventListener('beforeunload', warnBeforeUnload);
		return () => removeEventListener('beforeunload', warnBeforeUnload);
	});

	// Going elsewhere in the app keeps the page, so it first waits for the changes to be stored, and the page it goes to
	// reads them; only when that fails does it ask. Back and forward go at once; the writes still finish in the
	// background.
	const leaving: {
		to?: string;
		opener?: Element;
		isFlushing: boolean;
		isFlushed: boolean;
		answer?: (shouldLeave: boolean) => void;
	} = { isFlushing: false, isFlushed: false };
	const asking = $state({ isOpen: false });

	function shouldLeave(): Promise<boolean> {
		asking.isOpen = true;
		return new Promise((resolve) => (leaving.answer = resolve));
	}

	function answerLeave(shouldLeave: boolean) {
		const { answer, opener } = leaving;
		leaving.answer = undefined;
		asking.isOpen = false;
		if (!shouldLeave && opener instanceof HTMLElement && opener.isConnected) opener.focus();
		answer?.(shouldLeave);
	}

	beforeNavigate((navigation) => {
		if (navigation.type === 'popstate') {
			leaving.to = undefined;
			if (asking.isOpen) answerLeave(false);
		}
		if (navigation.willUnload || !navigation.to || navigation.type === 'popstate') return;
		if (leaving.isFlushed && leaving.to === navigation.to.url.href) return;
		if (asking.isOpen) {
			navigation.cancel();
			return;
		}
		if (!leaving.isFlushing && editor.status === 'saved') return;
		navigation.cancel();
		leaving.to = navigation.to.url.href;
		if (leaving.isFlushing) return;
		leaving.isFlushing = true;
		leaving.opener = document.activeElement ?? undefined;
		void flush().then(async () => {
			leaving.isFlushing = false;
			// Back or forward since the link, or the editor already gone, means the person went elsewhere meanwhile.
			if (leaving.to === undefined || changes.isDestroyed) return;
			if (editor.status === 'failed' && !(await shouldLeave())) {
				leaving.to = undefined;
				return;
			}
			if (leaving.to === undefined || changes.isDestroyed) return;
			leaving.isFlushed = true;
			try {
				// The address is the one the navigation was going to, already resolved.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(leaving.to!);
			} finally {
				leaving.isFlushed = false;
			}
		});
	});

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

	// The editor waits for the changes to be stored before leaving, as it does for any link in the app.
	async function present() {
		// `resolve` builds the path, and the rule doesn't follow it into a string with a hash.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${resolve('/app/deck/[id]/present', { id: deckId })}${hashForSlide(editor.selected)}`);
	}

	const typing = 'input, textarea, select, [contenteditable]';

	function onkeydown(event: KeyboardEvent) {
		if (asking.isOpen) return;
		const isModified = event.ctrlKey || event.metaKey || event.altKey;
		const isTyping = event.target instanceof Element && event.target.closest(typing) !== null;
		if (isModified || isTyping || event.defaultPrevented || event.repeat || event.key.toLowerCase() !== 'p') return;
		event.preventDefault();
		void present();
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
			changes.isDestroyed = true;
			removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			saver.stop();
			void flush();
		};
	});
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>{editor.title.trim() || 'Untitled deck'} · {appName}</title>
</svelte:head>

{#snippet toolbar()}
	<DeckTitle title={editor.title} onrename={rename} />
	<span class="saved" class:failed={editor.status === 'failed'}>
		<span class="{saveStatusIcons[editor.status]} icon" aria-hidden="true"></span>{saveStatusLabels[editor.status]}
	</span>
	<span class="spacer"></span>
	<button class="present" type="button" aria-keyshortcuts="P" onclick={present}>
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
				{aspect}
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
			<SlideWarnings {notices} />
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
			<SlidePreview slideId={current.id} markdown={current.markdown} {aspect} bind:notices />
		</section>
	</div>
	<LeaveDialog open={asking.isOpen} onchoose={answerLeave} />
</EditorFrame>

<style>
	.saved {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}

	.saved.failed {
		color: var(--heading);
		font-weight: 600;
	}

	@media (prefers-reduced-motion: no-preference) {
		.saved :global(.i-ri-loader-4-line) {
			animation: spin 1s linear infinite;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
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
