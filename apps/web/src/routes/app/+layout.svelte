<script lang="ts">
	import { onMount } from 'svelte';
	import '@fontsource-variable/hubot-sans/wght.css';
	import '@fontsource-variable/mona-sans/wght.css';
	import '@fontsource/monaspace-neon/latin-400.css';
	import '@fontsource/monaspace-neon/latin-400-italic.css';
	import '#lib/scheme.css';
	import Splash from '#lib/Splash.svelte';
	import { applyAppScheme, readAppScheme, refreshStoredAppScheme } from '#lib/app-scheme.ts';
	import { appSchemeKey } from '#lib/scheme-choice.ts';
	import { loadSchemes } from '#lib/schemes.ts';
	import { boot, startBoot } from '#lib/boot.svelte.ts';
	import { isolate, type IsolationOutcome } from '#lib/cross-origin-isolation.ts';
	import { shouldShowSplash, splashDelay, splashView } from '#lib/splash.ts';
	import { openDecks } from '#lib/warm.ts';

	let { children } = $props();

	const isolation: { outcome: IsolationOutcome | 'checking' } = $state({ outcome: 'checking' });
	const delay = $state({ hasPassed: false });
	const view = $derived(splashView(isolation.outcome, boot.state));

	// Set before the first paint, from what the last visit stored, so the app never flashes the default scheme.
	applyAppScheme(
		document.documentElement,
		readAppScheme(() => localStorage)
	);

	async function refreshAppScheme() {
		const refreshed = await refreshStoredAppScheme(() => localStorage, loadSchemes);
		if (refreshed !== false) applyAppScheme(document.documentElement, refreshed);
	}

	function onstorage(event: StorageEvent) {
		if (event.key === appSchemeKey || event.key === null) {
			applyAppScheme(
				document.documentElement,
				readAppScheme(() => localStorage)
			);
		}
	}

	onMount(() => {
		void refreshAppScheme();
		const timer = setTimeout(() => (delay.hasPassed = true), splashDelay);
		void (async () => {
			isolation.outcome = await isolate();
			if (isolation.outcome !== 'isolated') return;
			startBoot(openDecks);
		})();
		return () => {
			clearTimeout(timer);
			applyAppScheme(document.documentElement);
		};
	});
</script>

<svelte:window {onstorage} />

<div class="scheme">
	{#if !view}
		{@render children()}
	{:else if shouldShowSplash(view, delay.hasPassed)}
		<Splash {view} />
	{/if}
</div>
