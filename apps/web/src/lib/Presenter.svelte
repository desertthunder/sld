<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { appName } from '#lib/app-info.ts';
	import { presentSettings } from '#lib/deck-settings.ts';
	import type { DeckWithSlides } from '#lib/decks.ts';
	import {
		controlsDelay,
		hashForSlide,
		keyAction,
		moveTo,
		slideFromHash,
		tapAction,
		type PresenterAction
	} from '#lib/presenter-navigation.ts';
	import { exitFullscreen, isFullscreen, keepScreenOn, toggleFullscreen } from '#lib/screen.ts';
	import { resolveScheme } from '#lib/scheme-choice.ts';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import ShortcutsHelp from '#lib/ShortcutsHelp.svelte';
	import Slide from '#lib/Slide.svelte';
	import { deckAspect } from '#lib/stage.ts';

	let { deck, schemes }: { deck: DeckWithSlides; schemes: readonly Scheme[] } = $props();

	// A deck with no slides presents one blank slide, as the editor gives it one.
	const markdowns = $derived(deck.slides.length > 0 ? deck.slides.map(({ markdown }) => markdown) : ['']);
	const total = $derived(markdowns.length);
	const settings = $derived(presentSettings(deck.settings));
	const aspect = $derived(deckAspect(deck.aspect));
	const prefersLight = new MediaQuery('prefers-color-scheme: light');
	const scheme = $derived(resolveScheme(schemes, deck.scheme, prefersLight.current ? 'light' : 'dark'));

	const view = $state({ index: 0, isHelpOpen: false, areControlsShown: false });
	const number = $derived(view.index + 1);

	// Some browsers also hand the page the Escape that left full screen, once it has left, which must not stop presenting.
	const timing: { hideControls?: ReturnType<typeof setTimeout>; leftFullscreenAt: number } = {
		leftFullscreenAt: -Infinity
	};

	function showSlide(index: number) {
		view.index = index;
		const hash = hashForSlide(index);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- Only the hash changes, on the current page.
		if (location.hash !== hash) replaceState(hash, page.state);
	}

	function readHash() {
		showSlide(slideFromHash(location.hash, total));
	}

	function showControls() {
		view.areControlsShown = true;
		clearTimeout(timing.hideControls);
		timing.hideControls = setTimeout(() => (view.areControlsShown = false), controlsDelay);
	}

	function stopPresenting() {
		void exitFullscreen(document);
		// `resolve` builds the path, and the rule doesn't follow it into a string with a query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/app/deck/[id]', { id: deck.id })}?slide=${number}`, { replaceState: true });
	}

	/** A control's click handler. A pointer click leaves focus on the control, where Space and Enter would press it. */
	function press(run: () => void) {
		return (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
			if (event.detail > 0) event.currentTarget.blur();
			run();
		};
	}

	function act(action: PresenterAction) {
		switch (action) {
			case 'help': {
				view.isHelpOpen = !view.isHelpOpen;
				break;
			}
			case 'fullscreen': {
				void toggleFullscreen(document);
				break;
			}
			case 'escape': {
				if (view.isHelpOpen) view.isHelpOpen = false;
				else if (isFullscreen(document)) void exitFullscreen(document);
				else if (performance.now() - timing.leftFullscreenAt > 500) stopPresenting();
				break;
			}
			default: {
				showSlide(moveTo(view.index, total, action));
			}
		}
	}

	// Space and Enter on a focused control press it, as they do anywhere else.
	const pressable = 'a[href], button, input, select, textarea, summary, [contenteditable]';

	function onkeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		const action = keyAction(event);
		if (!action) return;
		const target = event.target instanceof Element ? event.target : undefined;
		if (target?.closest(pressable) && (event.key === ' ' || event.key === 'Enter')) return;
		event.preventDefault();
		if (action !== 'help' && action !== 'escape' && view.isHelpOpen) return;
		act(action);
	}

	const tappable =
		'a[href], button, input, select, textarea, summary, video, audio, [contenteditable], .controls, dialog';

	function onclick(event: MouseEvent) {
		if (event.target instanceof Element && event.target.closest(tappable)) return;
		const action = tapAction(event.clientX, window.innerWidth);
		if (action) act(action);
		else showControls();
	}

	function onfullscreenchange() {
		if (!isFullscreen(document)) timing.leftFullscreenAt = performance.now();
	}

	onMount(() => {
		readHash();
		const stopKeepingScreenOn = keepScreenOn(navigator, document);
		return () => {
			stopKeepingScreenOn();
			clearTimeout(timing.hideControls);
		};
	});
</script>

<svelte:head>
	<title>{deck.title} · {appName}</title>
</svelte:head>

<svelte:window {onkeydown} onhashchange={readHash} />
<svelte:document {onfullscreenchange} />

<!-- Keys work anywhere on the page, so the tap zones need no key handler of their own. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="presenter" class:idle={!view.areControlsShown} onpointermove={showControls} {onclick}>
	<Slide markdown={markdowns[view.index] ?? ''} {aspect} {scheme} {schemes}>
		{#snippet overlay()}
			{#if settings.slideNumber}
				<span class="number" aria-hidden="true">{number} / {total}</span>
			{/if}
		{/snippet}
	</Slide>

	<div
		class="progress"
		role="progressbar"
		aria-label="Slide {number} of {total}"
		aria-valuemin={1}
		aria-valuemax={total}
		aria-valuenow={number}>
		<div class="filled" style:width="{(number / total) * 100}%"></div>
	</div>

	<div class="controls" class:shown={view.areControlsShown} role="toolbar" aria-label="Presenter controls">
		<button
			type="button"
			aria-label="Previous slide"
			aria-disabled={view.index === 0}
			onclick={press(() => act('previous'))}>
			<span class="i-bi-chevron-left" aria-hidden="true"></span>
		</button>
		<span class="count">{number} / {total}</span>
		<button
			type="button"
			aria-label="Next slide"
			aria-disabled={view.index === total - 1}
			onclick={press(() => act('next'))}>
			<span class="i-bi-chevron-right" aria-hidden="true"></span>
		</button>
		<span class="separator" aria-hidden="true"></span>
		<!-- TODO: open the overview grid once it exists. -->
		<button type="button" aria-label="Overview" disabled>
			<span class="i-bi-grid" aria-hidden="true"></span>
		</button>
		<button type="button" aria-label="Shortcuts" onclick={press(() => act('help'))}>
			<span class="i-bi-question-circle" aria-hidden="true"></span>
		</button>
		<button type="button" aria-label="Stop presenting" onclick={press(stopPresenting)}>
			<span class="i-bi-x-lg" aria-hidden="true"></span>
		</button>
	</div>

	<ShortcutsHelp open={view.isHelpOpen} onclose={() => (view.isHelpOpen = false)} />
</div>

<style>
	.presenter {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;
		--code-font: 'Monaspace Neon', ui-monospace, monospace;

		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--bg);
		font-family: var(--ui-font);
		-webkit-font-smoothing: antialiased;
		user-select: none;
	}

	.idle,
	.idle :global(*) {
		cursor: none;
	}

	.number {
		position: absolute;
		right: 61px;
		bottom: 39px;
		font-family: var(--code-font);
		font-size: 26px;
		color: var(--muted);
	}

	.progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 4px;
		background: color-mix(in oklab, var(--border) 70%, var(--bg));
	}

	.filled {
		height: 100%;
		background: var(--accent);
	}

	.controls {
		position: absolute;
		left: 50%;
		bottom: 28px;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: 0 10px 30px var(--shadow);
		opacity: 0;
		pointer-events: none;
		transform: translateX(-50%);
		transition: opacity 200ms ease;
	}

	.controls.shown,
	.controls:has(:focus-visible) {
		opacity: 1;
		pointer-events: auto;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--heading);
		font-size: 18px;
		cursor: pointer;
	}

	button:hover:not(:disabled, [aria-disabled='true']) {
		background: var(--border);
	}

	button:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	button:disabled,
	button[aria-disabled='true'] {
		color: color-mix(in oklab, var(--muted) 55%, var(--surface));
		cursor: default;
	}

	.count {
		min-width: 72px;
		font-family: var(--code-font);
		font-size: 13px;
		text-align: center;
		color: var(--body);
	}

	.separator {
		width: 1px;
		height: 24px;
		margin: 0 6px;
		background: var(--border);
	}

	@media (prefers-reduced-motion: reduce) {
		.controls {
			transition: none;
		}
	}
</style>
