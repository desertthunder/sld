<script lang="ts">
	import { appName, appSummary } from '#lib/app-info.ts';
	import Slide from '#lib/Slide.svelte';
	import { sampleSlide } from '#lib/sample-slide.ts';
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<main>
	<h1>{appName}</h1>
	<p>{appSummary}</p>
	<div class="preview">
		<Slide markdown={sampleSlide} />
	</div>
</main>

<style>
	.preview {
		aspect-ratio: 16 / 9;
		max-width: 960px;
	}
</style>
