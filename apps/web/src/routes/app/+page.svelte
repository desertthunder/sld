<script lang="ts">
	import { onMount } from 'svelte';
	import { appName, appSummary } from '#lib/app-info.ts';
	import Slide from '#lib/Slide.svelte';
	import { sampleSlide } from '#lib/sample-slide.ts';

	// The layout shows this page only once the database is open, so a note handed over from the landing page is saved
	// here, and never while another tab with older code holds the database.
	onMount(() => {
		void (async () => {
			const [{ openDatabase }, { saveHandoff }] = await Promise.all([
				import('#lib/database.ts'),
				import('#lib/save-handoff.ts')
			]);
			// TODO: open the saved deck in the editor once there is one, and say so when the note couldn't be saved.
			await saveHandoff(await openDatabase(), sessionStorage);
		})();
	});
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
