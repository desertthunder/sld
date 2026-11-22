<script lang="ts">
	import { onMount } from 'svelte';
	import '@fontsource-variable/hubot-sans/wght.css';
	import '@fontsource-variable/mona-sans/wght.css';
	import '@fontsource/monaspace-neon/latin-400.css';
	import '@fontsource/monaspace-neon/latin-400-italic.css';
	import '#lib/scheme.css';
	import Splash from '#lib/Splash.svelte';
	import { boot, startBoot } from '#lib/boot.svelte.ts';
	import { isolate, type IsolationOutcome } from '#lib/cross-origin-isolation.ts';
	import { shouldShowSplash, splashDelay, splashView } from '#lib/splash.ts';

	let { children } = $props();

	const isolation: { outcome: IsolationOutcome | 'checking' } = $state({ outcome: 'checking' });
	const delay = $state({ hasPassed: false });
	const view = $derived(splashView(isolation.outcome, boot.state));

	onMount(() => {
		const timer = setTimeout(() => (delay.hasPassed = true), splashDelay);
		void (async () => {
			isolation.outcome = await isolate();
			if (isolation.outcome !== 'isolated') return;
			startBoot(async (lost, progress) => {
				const { openDatabase } = await import('#lib/database.ts');
				return openDatabase(lost, progress);
			});
		})();
		return () => clearTimeout(timer);
	});
</script>

<div class="scheme">
	{#if !view}
		{@render children()}
	{:else if shouldShowSplash(view, delay.hasPassed)}
		<Splash {view} />
	{/if}
</div>
