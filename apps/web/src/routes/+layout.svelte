<script lang="ts">
	import { onMount } from 'svelte';
	import { boot, startBoot } from '#lib/boot.svelte.ts';
	import { openDatabase } from '#lib/database.ts';

	let { children } = $props();

	onMount(() => {
		startBoot(openDatabase);
	});
</script>

{#if boot.state.status === 'ready'}
	{@render children()}
{:else if boot.state.status === 'opening'}
	<p role="status">Opening your decks…</p>
{:else}
	<p role="alert">Your decks could not be opened: {boot.state.error}</p>
{/if}
