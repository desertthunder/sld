<script lang="ts">
	import { appName, appSummary } from '#lib/app-info.ts';
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<main>
	<h1>{appName}</h1>
	<p>{appSummary}</p>
</main>
