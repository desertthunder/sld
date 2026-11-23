<script lang="ts">
	import { onDestroy } from 'svelte';
	import { appName } from '#lib/app-info.ts';
	import { actionLabels, copiedLabel, isFailure, type SplashAction, type SplashView } from '#lib/splash.ts';

	let { view }: { view: SplashView } = $props();

	const copy: { isCopied: boolean; timer?: ReturnType<typeof setTimeout> } = $state({ isCopied: false });
	let errorBox: HTMLElement | undefined = $state();

	onDestroy(() => clearTimeout(copy.timer));

	async function copyError() {
		try {
			await navigator.clipboard.writeText(view.error ?? '');
			copy.isCopied = true;
			clearTimeout(copy.timer);
			copy.timer = setTimeout(() => (copy.isCopied = false), 2000);
		} catch {
			// Where the clipboard is blocked, select the error so it can be copied by hand.
			if (errorBox) getSelection()?.selectAllChildren(errorBox);
		}
	}

	function act(action: SplashAction) {
		if (action === 'reload') location.reload();
		else if (action === 'open-in-new-tab') window.open(location.href, '_blank', 'noopener');
		else void copyError();
	}
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

{#snippet content()}
	<span class="label">{view.label}</span>
	<h1>{view.heading}</h1>
	{#if view.error !== undefined}
		<pre class="error" bind:this={errorBox}>{view.error}</pre>
	{/if}
	<p>{view.text}</p>
	{#if view.state === 'opening'}
		<div class="pulse" aria-hidden="true"><span></span><span></span><span></span></div>
	{:else if view.progress !== undefined}
		<div class="bar" aria-hidden="true"><i style:width="{view.progress * 100}%"></i></div>
	{/if}
	{#if view.actions.length > 0}
		<div class="actions">
			{#each view.actions as action, index (action)}
				<button type="button" class={index === 0 ? 'primary' : 'ghost'} onclick={() => act(action)}>
					{action === 'copy-error' && copy.isCopied ? copiedLabel : actionLabels[action]}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<div class="splash">
	<span class="wordmark">{appName}</span>
	<div class="stack">
		<div class="back behind"></div>
		<div class="back"></div>
		{#if isFailure(view)}
			<div class="card" role="alert">{@render content()}</div>
		{:else}
			<div class="card" role="status" aria-live="polite">{@render content()}</div>
		{/if}
	</div>
</div>

<style>
	.splash {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;
		--code-font: 'Monaspace Neon', ui-monospace, monospace;

		position: fixed;
		inset: 0;
		overflow: auto;
		display: flex;
		padding: 72px 24px 24px;
		box-sizing: border-box;
		background: var(--bg);
		color: var(--body);
		font-family: var(--ui-font);
		-webkit-font-smoothing: antialiased;
	}

	.wordmark {
		position: absolute;
		left: 32px;
		top: 24px;
		font-family: var(--display-font);
		font-weight: 700;
		font-size: 26px;
		letter-spacing: -0.03em;
		color: var(--heading);
	}

	.stack {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		width: min(560px, 100%);
		margin: auto;
	}

	.stack > * {
		grid-area: 1 / 1;
		min-width: 0;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.back {
		transform: translate(5px, 5px) rotate(0.8deg);
		opacity: 0.85;
	}

	.back.behind {
		transform: translate(10px, 10px) rotate(1.6deg);
		opacity: 0.7;
	}

	.card {
		position: relative;
		aspect-ratio: 16 / 10;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 60px 8% 7%;
		box-shadow:
			0 2px 3px var(--shadow),
			0 20px 44px var(--shadow);
	}

	.card::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 52px;
		height: 3px;
		background: var(--rule);
	}

	.label {
		font-family: var(--code-font);
		font-size: 12.5px;
		color: var(--muted);
	}

	h1 {
		margin: 14px 0 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: clamp(24px, 3.2vw, 34px);
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: var(--heading);
	}

	p {
		margin: 0;
		max-width: 40ch;
		font-size: 16px;
		line-height: 1.55;
	}

	.error {
		margin: 0;
		padding: 12px 14px;
		font-family: var(--code-font);
		font-size: 13px;
		line-height: 1.6;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--heading);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 220px;
		overflow: auto;
	}

	.bar {
		height: 6px;
		margin-top: auto;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
	}

	.bar i {
		display: block;
		height: 100%;
		border-radius: 3px;
		background: var(--accent);
		transition: width 0.3s ease-out;
	}

	.pulse {
		display: flex;
		gap: 6px;
		margin-top: auto;
	}

	.pulse span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.35;
		animation: pulse 1.2s ease-in-out infinite;
	}

	.pulse span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.pulse span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%,
		60%,
		100% {
			opacity: 0.35;
		}

		30% {
			opacity: 1;
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: auto;
	}

	button {
		min-height: 44px;
		padding: 0 20px;
		border-radius: 10px;
		font: 600 15px var(--ui-font);
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	.primary {
		border: 0;
		background: var(--link);
		color: var(--on-primary);
	}

	.ghost {
		padding: 0 18px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--body);
	}

	@media (prefers-reduced-motion: reduce) {
		.pulse span {
			animation: none;
		}

		.pulse span:nth-child(1) {
			opacity: 1;
		}

		.pulse span:nth-child(2) {
			opacity: 0.65;
		}

		.bar i {
			transition: none;
		}
	}

	@media (max-width: 520px) {
		.splash {
			padding-top: 64px;
		}

		.wordmark {
			left: 20px;
			top: 18px;
		}

		.card {
			padding: 60px 7% 8%;
		}

		p {
			font-size: 15px;
		}
	}
</style>
