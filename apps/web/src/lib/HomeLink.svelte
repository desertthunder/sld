<script lang="ts">
	import { resolve } from '$app/paths';
	import { appName } from '#lib/app-info.ts';
	import Mark from '#lib/Mark.svelte';
</script>

<a class="home" href={resolve('/')} aria-label="{appName} home"><Mark colors="scheme" size={32} /></a>

<style>
	.home {
		display: block;
		flex: none;
		border-radius: 6px;
	}

	.home:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
</style>
