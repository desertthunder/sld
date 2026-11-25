<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { appName } from '#lib/app-info.ts';
	import AppVersion from '#lib/AppVersion.svelte';
	import type { Database } from '#lib/database.ts';
	import DeckRow from '#lib/DeckRow.svelte';
	import type * as DecksModule from '#lib/decks.ts';
	import { deckFile, deckFileName, deckMarkdown } from '#lib/deck-file.ts';
	import { importDeckFiles } from '#lib/deck-import.ts';
	import type { DeckSummary, DeckWithSlides } from '#lib/decks.ts';
	import { download } from '#lib/download.ts';
	import { errorText } from '#lib/error-text.ts';
	import { deckFromNote } from '#lib/handoff.ts';
	import { slideCount } from '#lib/landing.ts';
	import {
		copyTitle,
		deckCount,
		deletedMessage,
		errorLeads,
		importFailure,
		isTextEntry,
		tabPlace
	} from '#lib/library.ts';
	import LibraryHeader from '#lib/LibraryHeader.svelte';
	import NewDeck from '#lib/NewDeck.svelte';
	import { sampleDeck } from '#lib/sample-deck.ts';
	import { pruneJournals } from '#lib/slide-journal.ts';
	import UndoToast from '#lib/UndoToast.svelte';

	type Store = { database: Database; queries: typeof DecksModule };

	const sample = deckFromNote(sampleDeck);

	const library: {
		decks?: DeckSummary[];
		error?: { lead: string; text: string };
		isReady: boolean;
		isCreating: boolean;
		hasLoadFailed: boolean;
		isExporting: boolean;
		isDragging: boolean;
		deleted?: { decks: DeckWithSlides[]; key: number };
		now: Date;
	} = $state({
		isReady: false,
		isCreating: false,
		hasLoadFailed: false,
		isExporting: false,
		isDragging: false,
		now: new Date()
	});

	// The database and its queries load once the page has mounted, so this page's code doesn't hold up the splash.
	const opened: { store?: Store } = {};
	let newDeck: ReturnType<typeof NewDeck> | undefined = $state();
	let toast: ReturnType<typeof UndoToast> | undefined = $state();
	let heading: HTMLElement | undefined = $state();
	let filePicker: HTMLInputElement | undefined = $state();
	// Drag events fire for each element the pointer crosses, so the drop hint shows while any enter lacks its leave.
	const drag = { depth: 0 };

	function fail(lead: keyof typeof errorLeads, error: unknown) {
		library.error = { lead: errorLeads[lead], text: errorText(error) };
	}

	async function refresh() {
		const { store } = opened;
		if (!store) return;
		library.decks = await store.queries.listDeckSummaries(store.database);
		pruneJournals(
			() => localStorage,
			library.decks.map(({ id }) => id)
		);
		if (!library.hasLoadFailed) return;
		library.hasLoadFailed = false;
		library.error = undefined;
	}

	async function refreshQuietly() {
		try {
			await refresh();
		} catch {
			// The list stays as it was; the next change or visit lists the decks again.
		}
	}

	/** Runs a write, reports its failure with the error message `lead` picks, then lists the decks again. */
	async function change<T>(
		lead: keyof typeof errorLeads,
		write: (store: Store) => Promise<T>
	): Promise<T | undefined> {
		const { store } = opened;
		if (!store) return undefined;
		library.error = undefined;
		try {
			return await write(store);
		} catch (error) {
			fail(lead, error);
			return undefined;
		} finally {
			await refreshQuietly();
		}
	}

	async function create(markdown: string) {
		const { store } = opened;
		if (!store || library.isCreating) return;
		library.isCreating = true;
		library.error = undefined;
		let id: string;
		try {
			({ id } = await store.queries.createDeck(store.database, deckFromNote(markdown)));
		} catch (error) {
			fail('deck', error);
			library.isCreating = false;
			return;
		}
		try {
			await goto(resolve('/app/deck/[id]', { id }));
		} catch {
			// The deck is saved, so it shows in the list instead.
			library.isCreating = false;
			await refreshQuietly();
		}
	}

	async function importFiles(files: File[]) {
		const { store } = opened;
		if (files.length === 0) return;
		if (!store || library.isCreating) {
			const reason = store ? 'another deck is still being made' : 'the library is still loading';
			library.error = importFailure(files.map(({ name }) => ({ name, reason })));
			return;
		}
		library.isCreating = true;
		library.error = undefined;
		const { ids, failures } = await importDeckFiles(files, {
			create: (deck) => store.queries.createDeck(store.database, deck),
			loadCleaner: async () => {
				const { cleanImportedSlide } = await import('#lib/imported-html.ts');
				return cleanImportedSlide;
			}
		});
		if (failures.length > 0) library.error = importFailure(failures);
		const [id] = ids;
		if (id !== undefined && files.length === 1) {
			try {
				await goto(resolve('/app/deck/[id]', { id }));
				return;
			} catch {
				// The deck is saved, so it shows in the list instead.
			}
		}
		library.isCreating = false;
		await refreshQuietly();
	}

	function onfilechange() {
		const files = [...(filePicker?.files ?? [])];
		if (filePicker) filePicker.value = '';
		void importFiles(files);
	}

	function hasFiles(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes('Files') ?? false;
	}

	function ondragenter(event: DragEvent) {
		if (!hasFiles(event)) return;
		drag.depth++;
		library.isDragging = true;
	}

	function ondragleave(event: DragEvent) {
		if (!hasFiles(event)) return;
		drag.depth = Math.max(drag.depth - 1, 0);
		if (drag.depth === 0) library.isDragging = false;
	}

	// A file dropped anywhere on the page imports, rather than the browser opening it in place of the app.
	function ondragover(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function ondrop(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		drag.depth = 0;
		library.isDragging = false;
		void importFiles([...(event.dataTransfer?.files ?? [])]);
	}

	async function exportDeck(summary: DeckSummary) {
		const { store } = opened;
		if (!store) return;
		library.error = undefined;
		try {
			const deck = await store.queries.getDeck(store.database, summary.id);
			if (!deck) throw new Error('The deck no longer exists');
			download(deckFileName(deck.title), deckMarkdown(deckFile(deck)), 'text/markdown');
		} catch (error) {
			fail('export', error);
		}
	}

	async function exportAll() {
		const { store } = opened;
		if (!store || library.isExporting) return;
		library.isExporting = true;
		library.error = undefined;
		try {
			const [decks, { archiveName, decksArchive }] = await Promise.all([
				store.queries.listDecksWithSlides(store.database),
				import('#lib/deck-archive.ts')
			]);
			download(archiveName(new Date()), decksArchive(decks), 'application/zip');
		} catch (error) {
			fail('exportAll', error);
		} finally {
			library.isExporting = false;
		}
	}

	function rename(deck: DeckSummary, title: string) {
		void change('change', ({ database, queries }) => queries.renameDeck(database, deck.id, title));
	}

	function duplicate(deck: DeckSummary) {
		void change('deck', ({ database, queries }) => queries.duplicateDeck(database, deck.id, copyTitle(deck.title)));
	}

	async function remove(deck: DeckSummary) {
		const removed = await change('change', ({ database, queries }) => queries.removeDeck(database, deck.id));
		if (!removed) return;
		// A delete while the toast shows joins the decks it can undo, and the new toast starts its timer again.
		library.deleted = { decks: [...(library.deleted?.decks ?? []), removed], key: (library.deleted?.key ?? 0) + 1 };
		await tick();
		toast?.focus();
	}

	async function undo() {
		const deleted = library.deleted;
		library.deleted = undefined;
		if (!deleted) return;
		const restored = await change('change', ({ database, queries }) =>
			queries.restoreDecks(database, deleted.decks)
		);
		// A restore that failed keeps the decks' only copies in the toast, with any deleted meanwhile, so Undo can be
		// tried again.
		if (!restored) {
			// A delete can finish while the restore runs, which TypeScript's narrowing above can't see.
			const later = library.deleted as typeof deleted | undefined;
			library.deleted = {
				decks: [...deleted.decks, ...(later?.decks ?? [])],
				key: Math.max(deleted.key, later?.key ?? 0) + 1
			};
		}
		await tick();
		const last = restored?.at(-1);
		if (last) document.querySelector<HTMLElement>(`#deck-${last.id}`)?.focus();
		else toast?.focus();
	}

	function dismiss(wasByKey: boolean) {
		library.deleted = undefined;
		if (wasByKey) heading?.focus();
	}

	function onpaste(event: ClipboardEvent) {
		if (event.defaultPrevented || isTextEntry(event.target)) return;
		const text = event.clipboardData?.getData('text/plain');
		if (!text || newDeck?.hasDraft()) return;
		event.preventDefault();
		void newDeck?.fill(text);
	}

	async function open() {
		const [{ openDatabase }, queries, { saveHandoff }] = await Promise.all([
			import('#lib/database.ts'),
			import('#lib/decks.ts'),
			import('#lib/save-handoff.ts')
		]);
		const database = await openDatabase();
		opened.store = { database, queries };
		// The layout shows this page only once the database is open, so a note handed over from the landing page is
		// saved here, and never while another tab with older code holds the database.
		// TODO: open the deck saved from a handed-over note in the editor.
		try {
			await saveHandoff(database, sessionStorage);
		} catch (error) {
			fail('deck', error);
		}
		library.isReady = true;
		await refresh();
	}

	onMount(() => {
		void open().catch((error: unknown) => {
			library.hasLoadFailed = true;
			fail('load', error);
		});
		const clock = setInterval(() => (library.now = new Date()), 30_000);
		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') return;
			library.now = new Date();
			void refreshQuietly();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			clearInterval(clock);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<svelte:window {onpaste} {ondragenter} {ondragleave} {ondragover} {ondrop} />

<div class="library">
	<LibraryHeader />
	<main>
		{#if library.error}
			<p class="error" role="alert">
				<span class="i-ri-error-warning-line icon" aria-hidden="true"></span>
				<span>{library.error.lead} <code>{library.error.text}</code></span>
			</p>
		{/if}
		<NewDeck bind:this={newDeck} isReady={library.isReady} isCreating={library.isCreating} oncreate={create} />
		<section
			class="decks"
			aria-labelledby="library-heading"
			aria-busy={library.decks === undefined && !library.hasLoadFailed}>
			<div class="head">
				<h2 id="library-heading" tabindex="-1" bind:this={heading}>Library</h2>
				{#if library.decks?.length}<span class="count">{deckCount(library.decks.length)}</span>{/if}
				<div class="files">
					<button
						class="file-button"
						type="button"
						disabled={!library.isReady || library.isCreating}
						onclick={() => filePicker?.click()}>
						<span class="i-ri-upload-2-line icon" aria-hidden="true"></span>Import
					</button>
					{#if library.decks?.length}
						<button
							class="file-button"
							type="button"
							disabled={library.isExporting}
							onclick={() => void exportAll()}>
							<span class="i-ri-download-2-line icon" aria-hidden="true"></span>Export all decks
						</button>
					{/if}
					<input
						type="file"
						accept=".md,.markdown,text/markdown"
						multiple
						hidden
						aria-label="Import markdown files"
						bind:this={filePicker}
						onchange={onfilechange} />
				</div>
			</div>
			{#if library.decks?.length}
				<ul class="list">
					{#each library.decks as deck, index (deck.id)}
						<DeckRow
							{deck}
							place={tabPlace(index)}
							now={library.now}
							onrename={(title) => rename(deck, title)}
							onduplicate={() => duplicate(deck)}
							onexport={() => void exportDeck(deck)}
							ondelete={() => void remove(deck)} />
					{/each}
				</ul>
			{:else if library.decks}
				<ul class="list">
					<li class="sample">
						<span class="tab">sample</span>
						<div class="card">
							<span class="title">{sample.title}</span>
							<span class="details">{slideCount(sample.slides.length)}</span>
							<button
								class="open"
								type="button"
								disabled={!library.isReady || library.isCreating}
								onclick={() => void create(sampleDeck)}>
								Open
							</button>
						</div>
					</li>
				</ul>
				<p class="note">
					Decks you make are saved here, in this browser. Open the sample to see how a deck works, or paste a
					note above.
				</p>
			{/if}
		</section>
	</main>
	<footer class="foot"><AppVersion /></footer>
	{#if library.isDragging}
		<div class="drop" aria-hidden="true">
			<p><span class="i-ri-markdown-line icon"></span>Drop markdown files to import them as decks</p>
		</div>
	{/if}
	<div class="toasts" role="status">
		{#if library.deleted}
			{#key library.deleted.key}
				<UndoToast
					bind:this={toast}
					message={deletedMessage(library.deleted.decks.map(({ title }) => title))}
					onundo={() => void undo()}
					ondismiss={dismiss} />
			{/key}
		{/if}
	</div>
</div>

<style>
	:global(body:has(.library)) {
		margin: 0;
	}

	.library {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;
		--code-font: 'Monaspace Neon', ui-monospace, monospace;

		background: var(--bg);
		color: var(--text);
		font-family: var(--ui-font);
		font-size: 16px;
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}

	.library :global(::selection) {
		background: var(--border);
		color: var(--heading);
	}

	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 40px 24px;
	}

	.foot {
		max-width: 960px;
		margin: 0 auto;
		/* Keeps the version clear of the undo toast when scrolled to the end. */
		padding: 0 24px 120px;
		font-size: 15px;
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin: 0 0 20px;
		padding: 12px 16px;
		background: var(--surface);
		border: 1px solid var(--danger);
		border-radius: 10px;
		color: var(--heading);
		overflow-wrap: anywhere;
	}

	.error .icon {
		flex: none;
		width: 20px;
		height: 20px;
		margin-top: 2px;
		color: var(--danger);
	}

	code {
		font-family: var(--code-font);
		font-size: 0.875em;
	}

	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px 16px;
		margin: 56px 0 20px;
	}

	h2 {
		margin: 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 32px;
		line-height: 1.2;
		letter-spacing: -0.02em;
		color: var(--heading);
	}

	.head h2 {
		margin-right: auto;
	}

	h2:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 4px;
		border-radius: 4px;
	}

	.count {
		font-size: 14px;
		color: var(--muted);
	}

	.files {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.file-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 16px 0 14px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: transparent;
		color: var(--text);
		font: 600 15px var(--ui-font);
		cursor: pointer;
	}

	.file-button:hover:not(:disabled) {
		border-color: var(--muted);
		color: var(--heading);
	}

	.file-button:disabled {
		color: var(--muted);
		cursor: not-allowed;
	}

	.file-button:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.file-button .icon {
		width: 18px;
		height: 18px;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sample {
		position: relative;
		padding-top: 28px;
	}

	.sample .tab {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		height: 29px;
		padding: 0 16px;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: 8px 8px 0 0;
		font-family: var(--code-font);
		font-size: 12.5px;
		line-height: 28px;
		color: var(--muted);
	}

	.sample .card {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 16px;
		min-height: 76px;
		padding: 14px 16px 14px 24px;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0 10px 10px;
	}

	.sample .title {
		flex: 1;
		min-width: 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 22px;
		line-height: 1.3;
		color: var(--heading);
	}

	.sample .details {
		font-size: 14px;
		color: var(--muted);
	}

	.open {
		min-height: 44px;
		padding: 0 20px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--heading);
		font: 600 15px var(--ui-font);
		cursor: pointer;
	}

	.open:hover:not(:disabled) {
		border-color: var(--muted);
	}

	.open:disabled {
		color: var(--muted);
		cursor: not-allowed;
	}

	.open:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.note {
		margin: 20px 0 0;
		padding: 20px 24px;
		border: 1px dashed var(--border);
		border-radius: 12px;
		color: var(--muted);
	}

	.drop {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: color-mix(in oklab, var(--bg) 85%, transparent);
		pointer-events: none;
	}

	.drop p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 100%;
		height: 100%;
		margin: 0;
		box-sizing: border-box;
		border: 2px dashed var(--accent);
		border-radius: 16px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 24px;
		color: var(--heading);
		text-align: center;
	}

	.drop .icon {
		flex: none;
		width: 32px;
		height: 32px;
		color: var(--accent);
	}

	.toasts {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 32px;
		z-index: 10;
		display: flex;
		justify-content: center;
		padding: 0 16px;
		pointer-events: none;
	}

	@media (max-width: 640px) {
		main {
			padding: 24px 16px;
		}

		.foot {
			padding: 0 16px 120px;
		}

		.head {
			margin-top: 40px;
		}

		h2 {
			font-size: 28px;
		}

		.sample .title {
			flex-basis: 100%;
			font-size: 20px;
		}

		.sample .details {
			flex: 1;
		}

		.toasts {
			bottom: 16px;
		}
	}
</style>
