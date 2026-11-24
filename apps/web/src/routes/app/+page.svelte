<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { appName } from '#lib/app-info.ts';
	import type { Database } from '#lib/database.ts';
	import DeckRow from '#lib/DeckRow.svelte';
	import type * as DecksModule from '#lib/decks.ts';
	import type { DeckSummary, DeckWithSlides } from '#lib/decks.ts';
	import { errorText } from '#lib/error-text.ts';
	import { deckFromNote } from '#lib/handoff.ts';
	import { slideCount } from '#lib/landing.ts';
	import { copyTitle, deckCount, deletedMessage, errorLeads, isTextEntry, tabPlace } from '#lib/library.ts';
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
		deleted?: { decks: DeckWithSlides[]; key: number };
		now: Date;
	} = $state({ isReady: false, isCreating: false, hasLoadFailed: false, now: new Date() });

	// The database and its queries load once the page has mounted, so this page's code doesn't hold up the splash.
	const opened: { store?: Store } = {};
	let newDeck: ReturnType<typeof NewDeck> | undefined = $state();
	let toast: ReturnType<typeof UndoToast> | undefined = $state();
	let heading: HTMLElement | undefined = $state();

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

<svelte:window {onpaste} />

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
		padding: 40px 24px 120px;
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
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
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

	h2:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 4px;
		border-radius: 4px;
	}

	.count {
		font-size: 14px;
		color: var(--muted);
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
			padding: 24px 16px 120px;
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
