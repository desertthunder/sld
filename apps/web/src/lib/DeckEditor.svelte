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
		anchoredChange,
		indexAfterDelete,
		joinSplit,
		nearestKept,
		type SlideItem,
		type SlideParts,
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
		type PaneWidths,
		withChange
	} from '#lib/deck-editor.ts';
	import { slideParts } from '#lib/deck-markdown.ts';
	import type { DeckChanges } from '#lib/deck-signal.ts';
	import { applyDeckChanges, getDeck, type DeckChange, type DeckWithSlides } from '#lib/decks.ts';
	import DeckTitle from '#lib/DeckTitle.svelte';
	import EditorFrame from '#lib/EditorFrame.svelte';
	import LeaveDialog from '#lib/LeaveDialog.svelte';
	import PaneHandle from '#lib/PaneHandle.svelte';
	import { hashForSlide } from '#lib/presenter-navigation.ts';
	import { ownSchemeNote, resolveScheme } from '#lib/scheme-choice.ts';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import SchemePicker from '#lib/SchemePicker.svelte';
	import Slide from '#lib/Slide.svelte';
	import SlideList from '#lib/SlideList.svelte';
	import { createSlideJournal, journaledEdits } from '#lib/slide-journal.ts';
	import { readSlideMeta } from '#lib/slide-meta.ts';
	import SlidePreview from '#lib/SlidePreview.svelte';
	import type { Notice } from '#lib/slide-notices.ts';
	import { createSlideSaver, saveStatusLabels, type SaveStatus, type SaverEntry } from '#lib/slide-saver.ts';
	import SlideWarnings from '#lib/SlideWarnings.svelte';
	import { deckAspect } from '#lib/stage.ts';

	let {
		database,
		deck,
		deckChanges,
		schemes,
		onmissing
	}: {
		database: Database;
		deck: DeckWithSlides;
		/** Another tab's writes to the deck, heard since before it was read. */
		deckChanges: DeckChanges;
		schemes: readonly Scheme[];
		/** Shows that the deck is gone, and whether changes made here and not yet stored went with it. */
		onmissing: (isUnsaved: boolean) => void;
	} = $props();

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
	const { id: deckId, title, slides, scheme } = deck;
	// svelte-ignore state_referenced_locally
	const aspect = deckAspect(deck.aspect);
	let notices: readonly Notice[] = $state([]);
	const journal = createSlideJournal(() => localStorage, deckId);
	// Typing that a closed tab hadn't stored yet shows at once, and is saved once the editor mounts.
	const journaled = journaledEdits(() => localStorage, deckId, slides);
	const editor: {
		title: string;
		scheme: string | null;
		isPicking: boolean;
		slides: SlideItem[];
		selected: number;
		status: SaveStatus;
		announcement: string;
		widths: PaneWidths;
		tab: EditorTab;
	} = $state({
		title,
		scheme,
		isPicking: false,
		slides: slides.map(({ id, markdown }) => ({ id, markdown: journaled.get(id) ?? markdown })),
		selected: selectedIndex(page.url.searchParams.get(slideParameter) ?? undefined, slides.length),
		status: 'saved',
		announcement: '',
		widths: parsePaneWidths(readStored(() => localStorage, paneWidthsKey)),
		tab: parseEditorTab(readStored(() => sessionStorage, editorTabKey))
	});
	const current = $derived(editor.slides[editor.selected]!);
	const prefersLight = new MediaQuery('prefers-color-scheme: light');
	const inUse = $derived(resolveScheme(schemes, editor.scheme, prefersLight.current ? 'light' : 'dark'));
	// A slide whose frontmatter names a scheme keeps it while the picker previews the deck's.
	const ownScheme = $derived.by(() => {
		const { scheme } = readSlideMeta(slideParts(current.markdown).frontmatter).meta;
		return schemes.find(({ slug }) => slug === scheme);
	});
	// The slides as last known to be stored, to go back to when a change fails and the deck can't be read. A change
	// shows at once and waits its turn to be written; `generation` moves on whenever the list is replaced by what is
	// stored, so the changes still waiting, made to the list that was replaced, are dropped. `takenBack` holds the edits
	// of a failed batch to the new slides it took back: the saver queues them again, and they were reported already.
	// `unwritten` holds the changes queued and not yet in a batch, in order, to make again over what another tab stored.
	const changes: {
		stored: SlideItem[];
		generation: number;
		isDestroyed: boolean;
		takenBack: Map<string, string>;
		unwritten: QueuedChange[];
	} = {
		stored: slides.map(({ id, markdown }) => ({ id, markdown })),
		generation: 0,
		isDestroyed: false,
		takenBack: new Map(),
		unwritten: []
	};

	// A change to the slides carries the generation it was made in, so a refresh since drops it, and the list it leaves.
	// `first` is written with it in the same batch, such as the part a split leaves in the slide. `isTyped` marks an edit
	// from the saver, which the journal holds.
	type QueuedChange = {
		change: DeckChange;
		generation?: number;
		list?: SlideItem[];
		first?: DeckChange;
		isTyped?: boolean;
	};

	// The splits not yet stored, in the order they were made. Until a split is stored, the journal holds the text its
	// slide had before the cut, with what is typed into either part since put back in, so a tab closed first keeps every
	// line in the one slide that is stored.
	type PendingSplit = SlideParts & { id: string; copy: string; join: (parts: SlideParts) => string };
	const splits: PendingSplit[] = [];

	const textOf = (id: string) => editor.slides.find((slide) => slide.id === id)?.markdown ?? '';
	const isSplitting = (id: string) => splits.some((split) => split.id === id || split.copy === id);

	/** The stored slide that `id` was cut from by splits not yet stored, or `id` itself. */
	function splitRoot(id: string): string {
		let root = id;
		for (let split = splits.findLast(({ copy }) => copy === root); split;) {
			root = split.id;
			split = splits.findLast(({ copy }) => copy === root);
		}
		return root;
	}

	/** The text of `id` with the parts that splits not yet stored cut from it put back, the latest split first. */
	function joined(id: string): string {
		let text = textOf(id);
		for (const split of splits.toReversed()) {
			if (split.id === id) text = split.join({ before: text, after: joined(split.copy) });
		}
		return text;
	}

	/** Journals the text of slide `id`, or of the slide a split not yet stored cut it from, as it now shows. */
	function journalSlide(id: string, previous: string) {
		if (!isSplitting(id)) {
			journal.record(id, textOf(id), previous);
			return;
		}
		const root = splitRoot(id);
		const text = joined(root);
		journal.record(root, text, text);
	}

	/**
	 * Journals both parts of each split stored in `batch` on their own, typed over the text the batch stored for them,
	 * and forgets the split.
	 */
	function settleSplits(batch: readonly QueuedChange[], applied: readonly boolean[]) {
		const storedText = (id: string, otherwise: string) => {
			const index = batch.findLastIndex(
				({ change }, index) => applied[index] && change.kind === 'update' && change.id === id
			);
			const change = batch[index]?.change;
			return change?.kind === 'update' ? change.markdown : otherwise;
		};
		for (const [index, { change }] of batch.entries()) {
			if (change.kind !== 'insert' || !applied[index]) continue;
			const at = splits.findIndex(({ copy }) => copy === change.id);
			if (at === -1) continue;
			const [split] = splits.splice(at, 1);
			for (const [id, base] of [
				[split!.id, storedText(split!.id, split!.before)],
				[split!.copy, storedText(split!.copy, split!.after)]
			] as const) {
				journal.drop(id);
				const text = joined(id);
				if (text !== base) journal.record(id, text, base);
			}
		}
	}

	/** Writes a batch of edits and changes in one transaction, resolving to whether nothing in it was lost. */
	async function didStoreBatch(entries: SaverEntry<QueuedChange>[]): Promise<boolean> {
		const sent = new Set(entries.map((entry) => entry.kind === 'change' && entry.change));
		changes.unwritten = changes.unwritten.filter((queued) => !sent.has(queued));
		const batch: QueuedChange[] = [];
		let isDropped = false;
		for (const entry of entries) {
			if (entry.kind === 'edit' && changes.takenBack.get(entry.id) === entry.markdown) {
				changes.takenBack.delete(entry.id);
				continue;
			}
			if (entry.kind === 'edit') {
				batch.push({ change: { kind: 'update', id: entry.id, markdown: entry.markdown }, isTyped: true });
			} else if (entry.change.generation === undefined || entry.change.generation === changes.generation) {
				if (entry.change.first) batch.push({ change: entry.change.first });
				batch.push(entry.change);
			} else {
				isDropped = true;
			}
		}
		if (batch.length === 0) return !isDropped;
		for (const { change, isTyped } of batch) {
			if (isTyped && change.kind === 'update' && !isSplitting(change.id))
				journal.writing(change.id, change.markdown);
		}
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
		for (const [index, { change }] of batch.entries()) {
			if (change.kind !== 'update') continue;
			if (applied[index]) journal.stored(change.id, change.markdown);
			else journal.drop(change.id);
		}
		settleSplits(batch, applied);
		const first = applied.indexOf(false);
		if (first === -1) {
			const list = batch.findLast(({ list }) => list)?.list;
			if (list) changes.stored = list;
			return !isDropped;
		}
		// Another tab changed the deck first, so show what is stored. A delete that tab already made isn't lost, but an
		// edit to a gone slide is, so is a new slide or copy placed after one, and so are the changes skipped after it.
		await refresh();
		return !isDropped && batch[first]!.change.kind === 'delete' && !applied.slice(first + 1).includes(false);
	}

	const saver = createSlideSaver<QueuedChange>({
		commit: didStoreBatch,
		onStatus: (status) => (editor.status = status),
		delay: 300
	});

	// CodeMirror loads only once a deck opens, in its own chunk.
	const markdownEditor = import('#lib/MarkdownEditor.svelte');
	const cursor = $state({ label: '' });
	let markdownPane: { goToLine: (line: number) => void } | undefined = $state();

	const phone = new MediaQuery(`max-width: ${phoneWidth}px`);
	let body: HTMLElement | undefined = $state();
	let listPane: HTMLElement | undefined = $state();
	let schemeButton: HTMLButtonElement | undefined = $state();

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
		// The changes still waiting are dropped with the list they were made to, splits among them.
		splits.length = 0;
		changes.unwritten = changes.unwritten.filter(({ generation }) => generation === undefined);
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
			onmissing(hasUnsaved());
			return;
		}
		changes.stored = stored.slides.map(({ id, markdown }) => ({ id, markdown }));
		show(changes.stored, true);
	}

	/** Whether a change made here is waiting, being written, or failed to be. */
	const hasUnsaved = () => editor.status !== 'saved' || changes.unwritten.length > 0;

	// Signals that arrive close together, such as another tab's batch and its rename, share one read.
	const remote: { isDue: boolean; timer?: ReturnType<typeof setTimeout> } = { isDue: false };

	function hearRemoteChange() {
		// A hidden tab reads the deck once it shows again.
		if (remote.isDue || document.visibilityState === 'hidden') return;
		remote.isDue = true;
		remote.timer = setTimeout(() => void saver.between(catchUp), 100);
	}

	/**
	 * Shows what another tab stored, with the changes this tab hasn't written yet made again over it by slide id, so
	 * none of them is dropped. Text typed here and not yet stored stays as typed, and its write then replaces the other
	 * tab's: the last write wins. Call it only between the saver's batches, so none of this tab's writes is half done.
	 */
	async function catchUp() {
		remote.isDue = false;
		if (changes.isDestroyed) return;
		let stored: DeckWithSlides | undefined;
		try {
			stored = await getDeck(database, deckId);
		} catch {
			// The next signal, or this tab's next change, reads it again.
			return;
		}
		if (changes.isDestroyed) return;
		if (!stored) {
			onmissing(hasUnsaved());
			return;
		}
		const unwritten = new Set(changes.unwritten.map(({ change }) => change.kind));
		if (!unwritten.has('rename')) editor.title = stored.title;
		if (!unwritten.has('scheme')) editor.scheme = stored.scheme;
		changes.stored = stored.slides.map(({ id, markdown }) => ({ id, markdown }));
		const previous = editor.slides.map(({ id }) => id);
		let list = changes.stored;
		for (const queued of changes.unwritten) {
			if (queued.first) list = withChange(list, queued.first);
			queued.change = anchoredChange(queued.change, list, previous);
			list = withChange(list, queued.change);
			if (queued.list) queued.list = list;
		}
		const { selected } = editor;
		// A slide with typing or a change of this tab's not yet written keeps the text it shows, which is newer than both
		// what is stored and the typing waiting, such as the part a split not yet written leaves in it.
		const shown = new Map(editor.slides.map(({ id, markdown }) => [id, markdown]));
		const local = new Set(
			changes.unwritten
				.flatMap(({ first, change }) => (first ? [first, change] : [change]))
				.map((made) => ('id' in made ? made.id : undefined))
		);
		editor.slides = list.map(({ id, markdown }) => {
			const isLocal = local.has(id) || saver.pending(id) !== undefined;
			return { id, markdown: (isLocal ? shown.get(id) : undefined) ?? saver.pending(id) ?? markdown };
		});
		const next = editor.slides.map(({ id }) => id);
		const index = next.indexOf(previous[selected]!);
		select(index === -1 ? nearestKept(previous, next, selected) : index);
		if (index === -1) await announce(`Slide ${selected + 1} was deleted in another tab.`);
	}

	/** Queues `queued` after the writes before it, as a change not yet written until its batch starts. */
	function queueChange(queued: QueuedChange) {
		changes.unwritten.push(queued);
		return saver.change(queued);
	}

	/**
	 * Shows `list` with the slide at `index` selected at once, then writes the change after the writes before it. When
	 * the write fails, or another tab changed the deck first, the list goes back to what is stored.
	 */
	async function change(list: SlideItem[], index: number, message: string, write: DeckChange, first?: DeckChange) {
		const { generation } = changes;
		editor.slides = list;
		select(index);
		void queueChange({
			change: write,
			first,
			generation,
			list: list.map(({ id, markdown }) => ({ id, markdown }))
		});
		await announce(message);
	}

	function addSlide() {
		const at = editor.selected + 1;
		const id = crypto.randomUUID();
		return change(editor.slides.toSpliced(at, 0, { id, markdown: '' }), at, `Added slide ${at + 1}.`, {
			kind: 'insert',
			id,
			after: current.id,
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
		await queueChange({ change: { kind: 'rename', title: next } });
	}

	async function useScheme(next: Scheme) {
		editor.scheme = next.slug;
		await queueChange({ change: { kind: 'scheme', scheme: next.slug } });
	}

	async function closePicker() {
		editor.isPicking = false;
		await tick();
		schemeButton?.focus();
	}

	function edit(id: string, markdown: string) {
		const slide = editor.slides.find((slide) => slide.id === id);
		if (slide) {
			const previous = slide.markdown;
			slide.markdown = markdown;
			journalSlide(id, previous);
		}
		saver.edit(id, markdown);
	}

	function choose(index: number, shouldOpen: boolean) {
		if (index !== editor.selected) void flush();
		select(index, shouldOpen);
	}

	/**
	 * Cuts a slide in two. The part it keeps is written with the new slide, never alone as an edit, so the lines below
	 * are never lost from the slide before the new slide holds them.
	 */
	function split(id: string, { before, after }: { before: string; after: string }) {
		const from = editor.slides.findIndex((slide) => slide.id === id);
		if (from === -1) return;
		const at = from + 1;
		const copy = crypto.randomUUID();
		const root = splitRoot(id);
		const whole = joined(root);
		splits.push({ id, copy, before, after, join: joinSplit(editor.slides[from]!.markdown, { before, after }) });
		journal.record(root, whole, whole);
		return change(
			editor.slides.toSpliced(from, 1, { id, markdown: before }, { id: copy, markdown: after }),
			at,
			`Split slide ${at} into slides ${at} and ${at + 1}.`,
			{ kind: 'insert', id: copy, after: id, markdown: after },
			{ kind: 'update', id, markdown: before }
		);
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

	const typing = 'input, textarea, select, [contenteditable], [role="listbox"]';

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
		for (const [id, markdown] of journaled) saver.edit(id, markdown);
		if (journaled.size > 0) void flush();
		// A tab may miss a signal while it is frozen or in the back-forward cache, so it reads the deck again whenever it
		// shows again.
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') void flush();
			else hearRemoteChange();
		};
		const onPageShow = ({ persisted }: PageTransitionEvent) => {
			if (persisted) hearRemoteChange();
		};
		addEventListener('pagehide', flush);
		addEventListener('pageshow', onPageShow);
		document.addEventListener('visibilitychange', onVisibilityChange);
		const stopListening = deckChanges.hear(hearRemoteChange);
		return () => {
			changes.isDestroyed = true;
			stopListening();
			clearTimeout(remote.timer);
			removeEventListener('pagehide', flush);
			removeEventListener('pageshow', onPageShow);
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
	<button
		class="scheme"
		type="button"
		aria-expanded={editor.isPicking}
		bind:this={schemeButton}
		onclick={() => (editor.isPicking ? closePicker() : (editor.isPicking = true))}>
		<span class="i-ri-palette-line icon" aria-hidden="true"></span><span class="sr">Scheme: </span><span
			class="scheme-name">
			{inUse.name}
		</span>
	</button>
	<button class="present" type="button" aria-keyshortcuts="P" onclick={present}>
		<span class="i-ri-play-line icon" aria-hidden="true"></span>Present<kbd>P</kbd>
	</button>
{/snippet}

<EditorFrame {toolbar}>
	{#if editor.isPicking}
		<SchemePicker
			{schemes}
			{inUse}
			label="Deck scheme"
			previewLabel="Previewing on slide {editor.selected + 1}"
			previewNote={ownScheme && ownSchemeNote(ownScheme.name)}
			focusOnMount
			onuse={(next) => next && useScheme(next)}
			onclose={closePicker}>
			{#snippet preview(scheme)}
				<Slide markdown={current.markdown} {aspect} {scheme} {schemes} />
			{/snippet}
		</SchemePicker>
	{/if}
	<div class="tabs" class:hidden={editor.isPicking} role="tablist" aria-label="Editor panes">
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
	<div class="body" class:hidden={editor.isPicking} style:--columns={columns} bind:this={body}>
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
				scheme={inUse}
				{schemes}
				selected={editor.selected}
				announcement={editor.announcement}
				onselect={choose}
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
			<div class="pane-header">
				<span>Slide {editor.selected + 1} · markdown</span><span>{cursor.label}</span>
			</div>
			{#await markdownEditor}
				<div class="editor-loading" aria-busy="true"></div>
			{:then { default: MarkdownEditor }}
				<MarkdownEditor
					bind:this={markdownPane}
					slideId={current.id}
					markdown={current.markdown}
					slideNumber={editor.selected + 1}
					onchange={edit}
					onblur={() => void flush()}
					onsplit={split}
					onposition={(label) => (cursor.label = label)} />
			{:catch}
				<p class="editor-failed" role="alert">The editor didn't load. Reload the page to try again.</p>
			{/await}
			<SlideWarnings {notices} ongoto={(line) => markdownPane?.goToLine(line)} />
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
			<SlidePreview
				slideId={current.id}
				markdown={current.markdown}
				{aspect}
				scheme={inUse}
				{schemes}
				bind:notices />
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

	.scheme {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--surface);
		color: var(--heading);
		font: 500 14px var(--ui-font);
		white-space: nowrap;
		cursor: pointer;
	}

	.scheme-name {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.scheme[aria-expanded='true'] {
		border-color: var(--accent);
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
	.scheme:focus-visible,
	.tab:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}

	.present:focus-visible,
	.scheme:focus-visible {
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
		justify-content: space-between;
		gap: 12px;
		height: 40px;
		padding: 0 16px;
		font-size: 13px;
		color: var(--muted);
		border-bottom: 1px solid var(--border);
	}

	.editor-loading {
		flex: 1;
	}

	.editor-failed {
		margin: 0;
		padding: 20px 24px;
		color: var(--heading);
	}

	.tabs.hidden,
	.body.hidden {
		display: none;
	}

	@media (max-width: 760px) {
		.saved:not(.failed),
		.present kbd {
			display: none;
		}

		.present {
			padding: 0 14px;
		}

		.scheme {
			padding: 0 11px;
		}

		/* The icon stands for the button at phone width, and the scheme's name stays in its accessible name. */
		.scheme-name {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
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
	}
</style>
