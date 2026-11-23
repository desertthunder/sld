<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { appName } from '#lib/app-info.ts';
	import { applyAppScheme, readAppScheme, storedAppScheme, writeAppScheme } from '#lib/app-scheme.ts';
	import AppPreview from '#lib/AppPreview.svelte';
	import EditorFrame from '#lib/EditorFrame.svelte';
	import { resolveScheme } from '#lib/scheme-choice.ts';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import SchemePicker from '#lib/SchemePicker.svelte';
	import { loadSchemes } from '#lib/schemes.ts';

	const settings: { schemes: Scheme[] | undefined; slug: string | undefined } = $state({
		schemes: undefined,
		slug: readAppScheme(() => localStorage)?.slug
	});
	const prefersLight = new MediaQuery('prefers-color-scheme: light');
	const inUse = $derived(
		settings.schemes && resolveScheme(settings.schemes, settings.slug, prefersLight.current ? 'light' : 'dark')
	);

	function use(scheme: Scheme) {
		const stored = storedAppScheme(scheme);
		settings.slug = scheme.slug;
		writeAppScheme(() => localStorage, stored);
		applyAppScheme(document.documentElement, stored);
	}

	onMount(() => {
		void (async () => {
			settings.schemes = await loadSchemes();
		})();
	});
</script>

<svelte:head>
	<title>Settings · {appName}</title>
</svelte:head>

{#snippet toolbar()}
	<h1>Settings</h1>
{/snippet}

<EditorFrame {toolbar}>
	{#if inUse && settings.schemes}
		<SchemePicker
			schemes={settings.schemes}
			{inUse}
			label="App scheme"
			previewLabel="Previewing the app"
			onuse={use}>
			{#snippet preview(scheme)}
				<AppPreview {scheme} />
			{/snippet}
		</SchemePicker>
	{:else}
		<div aria-busy="true"></div>
	{/if}
</EditorFrame>

<style>
	h1 {
		margin: 0;
		padding: 6px 10px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 19px;
		color: var(--heading);
	}
</style>
