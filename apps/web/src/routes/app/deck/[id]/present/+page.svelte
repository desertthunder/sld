<script lang="ts">
	import { page } from '$app/state';
	import type { DeckWithSlides } from '#lib/decks.ts';
	import Presenter from '#lib/Presenter.svelte';
	import PresenterMissing from '#lib/PresenterMissing.svelte';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { loadSchemes } from '#lib/schemes.ts';

	type Loaded =
		{ status: 'loading' } | { status: 'missing' } | { status: 'found'; deck: DeckWithSlides; schemes: Scheme[] };

	const view: { loaded: Loaded } = $state({ loaded: { status: 'loading' } });

	async function load(id: string): Promise<Loaded> {
		const [{ openDatabase }, { getDeck }, schemes] = await Promise.all([
			import('#lib/database.ts'),
			import('#lib/decks.ts'),
			loadSchemes()
		]);
		const deck = await getDeck(await openDatabase(), id);
		return deck ? { status: 'found', deck, schemes } : { status: 'missing' };
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
		<Presenter deck={view.loaded.deck} schemes={view.loaded.schemes} />
	{/key}
{:else if view.loaded.status === 'missing'}
	<PresenterMissing />
{:else}
	<div aria-busy="true"></div>
{/if}
