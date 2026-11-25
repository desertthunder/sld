<script lang="ts">
	import { appVersion, versionLabel } from '#lib/app-info.ts';

	const label = versionLabel(appVersion);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- Both links go to GitHub, outside the app. -->
<span class="version">
	{#if label.nameHref}<a href={label.nameHref}>{label.name}</a>{:else}{label.name}{/if}
	{#if label.sha}(<a href={label.shaHref}>{label.sha}</a>){/if}
</span>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	.version {
		font-family: var(--code-font);
		font-size: 0.875em;
		color: var(--muted);
	}

	a {
		color: inherit;
		text-underline-offset: 3px;
	}

	a:hover {
		color: var(--heading);
	}

	a:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
		border-radius: 2px;
	}
</style>
