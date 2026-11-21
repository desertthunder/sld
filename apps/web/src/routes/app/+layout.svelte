<script lang="ts">
	import { onMount } from 'svelte';
	import { boot, startBoot } from '#lib/boot.svelte.ts';
	import { isolate, type IsolationOutcome } from '#lib/cross-origin-isolation.ts';

	let { children } = $props();

	const isolation: { outcome: IsolationOutcome | 'checking' } = $state({ outcome: 'checking' });

	onMount(() => {
		void (async () => {
			isolation.outcome = await isolate();
			if (isolation.outcome === 'reloading') return;
			startBoot(async (lost, progress) => {
				const { openDatabase } = await import('#lib/database.ts');
				return openDatabase(lost, progress);
			});
		})();
	});
</script>

{#if isolation.outcome === 'unavailable'}
	<p role="alert">
		This browser didn't make the page cross-origin isolated, so slides can't be read from markdown here. Reload the
		page, or open it in a current version of Chrome, Firefox or Safari.
	</p>
{/if}

{#if isolation.outcome === 'checking' || isolation.outcome === 'reloading'}
	<p role="status">Getting this browser ready…</p>
{:else if boot.state.status === 'ready'}
	{@render children()}
{:else if boot.state.status === 'opening'}
	<p role="status">Opening your decks…</p>
{:else}
	<p role="alert">Your decks could not be opened: {boot.state.error}</p>
{/if}
