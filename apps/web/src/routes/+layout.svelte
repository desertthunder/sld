<script lang="ts">
	import { onMount } from 'svelte';
	import { boot, startBoot } from '#lib/boot.svelte.ts';

	let { children } = $props();

	onMount(() => {
		startBoot(async (lost, progress) => {
			const { openDatabase } = await import('#lib/database.ts');
			return openDatabase(lost, progress);
		});
	});
</script>

{#if boot.state.status === 'ready'}
	{@render children()}
{:else if boot.state.status === 'opening'}
	<p role="status">Opening your decks…</p>
{:else}
	<p role="alert">Your decks could not be opened: {boot.state.error}</p>
{/if}
