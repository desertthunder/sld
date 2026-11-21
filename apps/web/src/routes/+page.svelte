<script lang="ts">
	import { resolve } from '$app/paths';
	import { appName, appSummary } from '#lib/app-info.ts';
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<!-- TODO: replace this placeholder with the landing page design and copy. -->
<main>
	<h1>{appName}</h1>
	<p>{appSummary}</p>
	<p><a href={resolve('/app')}>Open App</a></p>
</main>
