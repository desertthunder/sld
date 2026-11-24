<script lang="ts">
	import { page } from '$app/state';
	import type { Database } from '#lib/database.ts';
	import type { DeckWithSlides } from '#lib/decks.ts';
	import DeckEditor from '#lib/DeckEditor.svelte';
	import DeckNotFound from '#lib/DeckNotFound.svelte';
	import EditorFrame from '#lib/EditorFrame.svelte';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { loadSchemes } from '#lib/schemes.ts';

	type Loaded =
		| { status: 'loading' }
		| { status: 'missing'; isDeleted?: boolean }
		| { status: 'found'; database: Database; deck: DeckWithSlides; schemes: Scheme[] };

	const view: { loaded: Loaded } = $state({ loaded: { status: 'loading' } });

	async function load(id: string): Promise<Loaded> {
		const [{ openDatabase }, { getDeck, insertSlide }, schemes] = await Promise.all([
			import('#lib/database.ts'),
			import('#lib/decks.ts'),
			loadSchemes()
		]);
		const database = await openDatabase();
		let deck = await getDeck(database, id);
		if (deck && deck.slides.length === 0) {
			await insertSlide(database, deck.id, 0, '');
			deck = await getDeck(database, id);
		}
		return deck ? { status: 'found', database, deck, schemes } : { status: 'missing' };
	}

	$effect(() => {
		const id = page.params.id ?? '';
		let isCurrent = true;
		view.loaded = { status: 'loading' };
		void (async () => {
			const loaded = await load(id);
			if (isCurrent) view.loaded = loaded;
		})();
		return () => {
			isCurrent = false;
		};
	});
</script>

{#if view.loaded.status === 'found'}
	{#key view.loaded.deck.id}
		<DeckEditor
			database={view.loaded.database}
			deck={view.loaded.deck}
			schemes={view.loaded.schemes}
			onmissing={() => (view.loaded = { status: 'missing', isDeleted: true })} />
	{/key}
{:else if view.loaded.status === 'missing'}
	<DeckNotFound isDeleted={view.loaded.isDeleted} />
{:else}
	<EditorFrame>
		<div aria-busy="true"></div>
	</EditorFrame>
{/if}
