<script lang="ts">
	import { onMount } from 'svelte';
	import '@fontsource-variable/hubot-sans/wght.css';
	import '@fontsource-variable/mona-sans/wght.css';
	import '@fontsource/monaspace-neon/latin-400.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import '#lib/scheme.css';
	import { appName } from '#lib/app-info.ts';
	import AppVersion from '#lib/AppVersion.svelte';
	import { boot, startBoot } from '#lib/boot.svelte.ts';
	import { isolate } from '#lib/cross-origin-isolation.ts';
	import { splitDeck } from '#lib/deck-markdown.ts';
	import { handOff } from '#lib/handoff.ts';
	import IndexCard from '#lib/IndexCard.svelte';
	import { fanSize, fanTransform, sampleDecks, sampleNote, slideCount } from '#lib/landing.ts';
	import Slide from '#lib/Slide.svelte';
	import { renderSlide } from '#lib/slide-render.ts';
	import { openDecks, whenIdle } from '#lib/warm.ts';

	let { data } = $props();

	const sampleSlides = splitDeck(sampleNote).slides;
	const note = $state({ markdown: sampleNote, preview: sampleSlides[1] ?? '' });
	const slides = $derived(splitDeck(note.markdown).slides);
	const dealt = $derived(slides.slice(0, fanSize));
	const page = $state({ canDrawSlides: false, isWarming: false });
	const statuses = {
		opening: { isReady: false, label: 'Opening decks' },
		ready: { isReady: true, label: 'Decks ready' }
	};
	const status = $derived(
		page.isWarming && (boot.state.status === 'opening' || boot.state.status === 'ready')
			? statuses[boot.state.status]
			: undefined
	);
	let noteBox: HTMLTextAreaElement | undefined = $state();

	onMount(() => {
		const state = { isMounted: true, stop: () => {} };
		void (async () => {
			if ((await isolate()) !== 'isolated' || !state.isMounted) return;
			state.stop = whenIdle(() => {
				page.isWarming = true;
				void startBoot(openDecks);
			});
			try {
				// Loading the renderer first keeps the slides from showing a loading message while it downloads.
				await renderSlide(sampleSlides[0] ?? '');
				page.canDrawSlides = true;
			} catch {
				// The slides keep showing their markdown.
			}
		})();
		return () => {
			state.isMounted = false;
			state.stop();
		};
	});

	async function openAsDeck() {
		try {
			handOff(sessionStorage, note.markdown);
		} catch {
			// Where the browser blocks this site's storage, `/app` can't open decks either, and its splash says so.
			// TODO: say so when the note is too big for `sessionStorage`; `/app` opens without it.
		}
		await goto(resolve('/app'));
	}

	function pasteNote(event: MouseEvent) {
		if (!noteBox) return;
		event.preventDefault();
		noteBox.focus();
		noteBox.select();
	}
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

{#snippet slide(markdown: string)}
	{#if page.canDrawSlides}
		<Slide {markdown} />
	{:else}
		<pre class="source">{markdown}</pre>
	{/if}
{/snippet}

<div class="scheme">
	<div class="landing">
		<div class="wrap">
			<header class="nav">
				<a class="mark" href="#top">{appName}</a>
				<div class="nav-end">
					<span class="status" role="status">
						{#if status}
							<span class={['dot', { ready: status.isReady }]} aria-hidden="true"></span>
							<span class="status-label">{status.label}</span>
						{/if}
					</span>
					<a class="button" href={resolve('/app')}>Open App</a>
				</div>
			</header>

			<main id="top">
				<section class="hero">
					<h1>Easy slides from markdown</h1>
					<p class="lede">It runs in your browser, so there's nothing to install and no account to make.</p>
					<div class="deal">
						<div class="note">
							<label for="note">
								Your slides as markdown. A <code>---</code> line starts a new slide.
							</label>
							<textarea id="note" spellcheck="false" bind:value={note.markdown} bind:this={noteBox}
							></textarea>
							<div class="note-actions">
								<button
									type="button"
									class="button"
									disabled={slides.length === 0}
									onclick={openAsDeck}>
									Open as a deck
								</button>
								<span class="count">{slideCount(slides.length)}</span>
							</div>
						</div>
						<div class="fan">
							{#each dealt as markdown, index (index)}
								<div class="card" style:transform={fanTransform(index, dealt.length)}>
									<IndexCard
										{markdown}
										number="{index + 1} / {slides.length}"
										canRender={page.canDrawSlides} />
								</div>
							{/each}
						</div>
					</div>
				</section>

				<section class="band">
					<div class="two">
						<div>
							<h2 id="live-preview">Live Preview</h2>
							<p class="copy">The slide updates as you type.</p>
						</div>
						<div class="flip">
							<textarea
								class="card source-card"
								aria-labelledby="live-preview"
								spellcheck="false"
								bind:value={note.preview}></textarea>
							<div class="card preview-card">
								<IndexCard
									markdown={note.preview}
									number="2 / {sampleSlides.length}"
									canRender={page.canDrawSlides} />
							</div>
						</div>
					</div>
				</section>

				<section class="band">
					<div class="two">
						<div>
							<h2>Your decks stay in this browser.</h2>
							<p class="copy">
								sld saves decks in a database inside your browser, and no server ever receives them.
								Clearing this site's data deletes them, so export a deck to keep a copy.
							</p>
						</div>
						<div>
							<div class="box">
								<div class="tabs">
									{#each sampleDecks as deck (deck.title)}
										<div class="divider">
											<span class="deck-title">{deck.title}</span>
											<span class="deck-count">{slideCount(deck.slides)}</span>
										</div>
									{/each}
								</div>
							</div>
							<p class="box-label">Sample decks</p>
						</div>
					</div>
					<div class="facts">
						<p>
							<strong>Nothing to install.</strong> Open the page and paste. There's no app to download and no
							command line.
						</p>
						<p><strong>No account.</strong> You never sign up or sign in.</p>
						<p>
							<strong>Export any time.</strong> Download a deck as one markdown file, with its
							<code>---</code>
							lines back in place.
						</p>
					</div>
				</section>

				<section class="band">
					<h2>Themeable</h2>
					<p class="copy">
						Each deck has a color scheme, typefaces and layouts you can change. sld adjusts colors so text
						stays readable, and warns you when the color scheme isn't accessible.
					</p>
					<div class="swatches">
						{#each data.swatches as scheme (scheme.slug)}
							<div>
								<!-- The swatch takes the scheme's colors and roles in place of the page's. -->
								<div class="screen swatch" style={scheme.style}>
									{@render slide(sampleSlides[1] ?? '')}
								</div>
								<p class="swatch-name">{scheme.name}</p>
							</div>
						{/each}
					</div>
				</section>

				<section class="band">
					<h2>Present from the same tab.</h2>
					<p class="copy">Press P to fill the screen. The arrow keys move between slides, and Esc stops.</p>
					<div class="screen present">{@render slide(sampleSlides.at(-1) ?? '')}</div>
					<div class="keys">
						<kbd>←</kbd><kbd>→</kbd><span>move</span>
						<kbd>P</kbd><span>present</span>
						<kbd>Esc</kbd><span>exit</span>
					</div>
				</section>

				<section class="close">
					<h2>Turn your existing notes into slides.</h2>
					<div class="close-actions">
						<a class="button" href={resolve('/app')}>Open App</a>
						<a class="ghost" href="#note" onclick={pasteNote}>Paste a note</a>
					</div>
				</section>
			</main>

			<footer class="foot">
				<span>sld runs entirely in your browser.</span>
				<AppVersion />
			</footer>
		</div>
	</div>
</div>

<style>
	.landing {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;
		--code-font: 'Monaspace Neon', ui-monospace, monospace;

		min-height: 100vh;
		overflow-x: clip;
		background: var(--bg);
		color: var(--body);
		font-family: var(--ui-font);
		font-size: 18px;
		line-height: 1.55;
		-webkit-font-smoothing: antialiased;
	}

	.landing ::selection {
		background: var(--border);
		color: var(--heading);
	}

	.wrap {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 48px;
		box-sizing: border-box;
	}

	code {
		font-family: var(--code-font);
		font-size: 0.9em;
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 88px;
	}

	.mark {
		font-family: var(--display-font);
		font-weight: 700;
		font-size: 30px;
		letter-spacing: -0.03em;
		color: var(--heading);
		text-decoration: none;
	}

	.nav-end {
		display: flex;
		align-items: center;
		gap: 24px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		color: var(--muted);
	}

	.dot {
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		border: 2px solid var(--muted);
		border-radius: 50%;
	}

	.dot.ready {
		border-color: var(--accent);
		background: var(--accent);
	}

	.button,
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0 22px;
		box-sizing: border-box;
		border-radius: 10px;
		font: 600 16px var(--ui-font);
		text-decoration: none;
		cursor: pointer;
	}

	.button {
		border: 0;
		background: var(--link);
		color: var(--on-primary);
	}

	.button:hover {
		filter: brightness(1.08);
	}

	.button:disabled {
		cursor: default;
		filter: none;
		opacity: 0.5;
	}

	.ghost {
		padding: 0 20px;
		border: 1px solid var(--border);
		color: var(--body);
	}

	.ghost:hover {
		color: var(--heading);
	}

	:is(.button, .ghost, .mark, textarea):focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	.hero {
		padding: 72px 0 112px;
	}

	h1 {
		margin: 0;
		font-family: var(--display-font);
		font-weight: 650;
		font-size: clamp(40px, 5.625vw, 72px);
		line-height: 1;
		letter-spacing: -0.035em;
		color: var(--heading);
		text-wrap: balance;
	}

	.lede {
		max-width: 34ch;
		margin: 28px 0 0;
		font-size: 21px;
		line-height: 1.5;
	}

	.deal {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: 56px;
		align-items: start;
		margin-top: 72px;
	}

	.note label {
		display: block;
		margin-bottom: 10px;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}

	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		padding: 22px 24px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		color: var(--body);
		caret-color: var(--accent);
		font-family: var(--code-font);
		font-size: 14.5px;
		line-height: 1.7;
	}

	.note textarea {
		height: 388px;
	}

	.note-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px;
		margin-top: 20px;
	}

	.count {
		font-family: var(--code-font);
		font-size: 14px;
		color: var(--heading);
	}

	.fan {
		position: relative;
		height: 460px;
	}

	/* An index card: a raised surface whose ruled face `IndexCard` draws, its grid scaled to the card's width. */
	.card {
		position: absolute;
		top: 0;
		left: 0;
		width: 78%;
		aspect-ratio: 16 / 10;
		box-sizing: border-box;
		container-type: inline-size;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		box-shadow:
			0 2px 3px var(--shadow),
			0 18px 40px var(--shadow);
		transform-origin: 20% 80%;
		transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.source {
		margin: 0;
		padding: 16px 7%;
		overflow: hidden;
		font-family: var(--code-font);
		font-size: 13px;
		line-height: 1.6;
		color: var(--body);
		white-space: pre-wrap;
	}

	.band {
		padding: 120px 0;
		border-top: 1px solid var(--border);
	}

	h2 {
		max-width: 16ch;
		margin: 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: clamp(34px, 4.4vw, 60px);
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--heading);
		text-wrap: balance;
	}

	.copy {
		max-width: 42ch;
		margin: 24px 0 0;
		font-size: 19px;
		line-height: 1.6;
	}

	.two {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: 72px;
		align-items: center;
	}

	.flip {
		position: relative;
		height: 440px;
	}

	.flip .card {
		width: 64%;
	}

	.source-card {
		padding: 24px 28px;
		resize: none;
		transform: rotate(-3deg);
	}

	.preview-card {
		top: auto;
		right: 0;
		bottom: 0;
		left: auto;
		transform: rotate(3deg);
	}

	.box {
		position: relative;
		margin-top: 64px;
		padding: 28px 28px 32px;
		border: 1px solid var(--border);
		border-top: 0;
		border-radius: 0 0 18px 18px;
		background: var(--bg);
		box-shadow: 0 18px 40px var(--shadow);
	}

	.box::before {
		content: '';
		position: absolute;
		top: -14px;
		right: -1px;
		left: -1px;
		height: 14px;
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: 14px 14px 0 0;
		background: var(--surface);
	}

	.tabs {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.divider {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}

	.divider:nth-child(2) {
		margin-left: 24px;
	}

	.divider:nth-child(3) {
		margin-left: 48px;
	}

	.deck-title {
		font-family: var(--display-font);
		font-weight: 600;
		font-size: 20px;
		color: var(--heading);
	}

	.deck-count,
	.box-label,
	.swatch-name {
		font-family: var(--code-font);
		font-size: 13px;
		color: var(--muted);
	}

	.box-label {
		margin: 14px 0 0;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 40px;
		margin-top: 72px;
	}

	.facts p {
		margin: 0;
		font-size: 17px;
	}

	.facts strong {
		display: block;
		margin-bottom: 10px;
		font-family: var(--display-font);
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--heading);
	}

	.screen {
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--body);
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 28px;
		margin-top: 64px;
	}

	.swatch {
		box-shadow:
			0 2px 3px var(--shadow),
			0 14px 32px var(--shadow);
	}

	.swatch-name {
		margin: 14px 0 0;
		font-size: 14px;
	}

	.present {
		max-width: 880px;
		margin: 64px 0 0 auto;
		border-radius: 14px;
	}

	.keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 20px;
		font-size: 14px;
		color: var(--muted);
	}

	.keys span:not(:last-child) {
		margin-right: 8px;
	}

	kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 30px;
		height: 30px;
		padding: 0 8px;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-bottom-width: 3px;
		border-radius: 6px;
		background: var(--surface);
		color: var(--heading);
		font-family: var(--code-font);
		font-size: 13px;
	}

	.close {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 32px;
		padding: 120px 0 64px;
		border-top: 1px solid var(--border);
	}

	.close-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px 24px;
		padding: 32px 0 48px;
		border-top: 1px solid var(--border);
		font-size: 15px;
		color: var(--muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}

	@media (max-width: 760px) {
		.wrap {
			padding: 0 20px;
		}

		.nav {
			min-height: 0;
			padding: 20px 0;
		}

		/* A phone shows the dot alone, and screen readers still read the label. */
		.status-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.hero {
			padding: 32px 0 72px;
		}

		.lede {
			font-size: 18px;
		}

		.deal,
		.two,
		.facts,
		.swatches {
			grid-template-columns: minmax(0, 1fr);
			gap: 40px;
		}

		.deal {
			margin-top: 40px;
		}

		.note textarea {
			height: 300px;
			font-size: 13.5px;
		}

		.fan {
			height: 300px;
		}

		/* The fan spreads its cards over a quarter of a card's width, so narrower cards keep the front one on screen. */
		.card {
			width: 72%;
		}

		.flip .card {
			width: 86%;
		}

		.flip {
			height: 480px;
		}

		.band {
			padding: 80px 0;
		}

		.facts {
			margin-top: 48px;
			gap: 32px;
		}

		.divider:nth-child(2) {
			margin-left: 12px;
		}

		.divider:nth-child(3) {
			margin-left: 24px;
		}
	}
</style>
