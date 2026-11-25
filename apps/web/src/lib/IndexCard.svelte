<script lang="ts">
	import { cardText, placeholderCard, type CardText } from '#lib/index-card.ts';
	import { renderSlide } from '#lib/slide-render.ts';

	let {
		markdown,
		number,
		canRender
	}: {
		markdown: string;
		/** Where the slide sits in its deck, such as `2 / 4`. */
		number: string;
		/** Whether the markdown renderer has loaded. Until it has, the card shows the slide's markdown as typed. */
		canRender: boolean;
	} = $props();

	// The last text stays on the card while the next renders, so typing doesn't flash the lines.
	const view: { drawn: CardText | undefined } = $state({ drawn: undefined });
	const card = $derived(view.drawn ?? placeholderCard(markdown));

	$effect(() => {
		if (!canRender) return;
		let isCurrent = true;
		void (async () => {
			try {
				const { html } = await renderSlide(markdown);
				if (isCurrent) view.drawn = cardText(html);
			} catch {
				if (isCurrent) view.drawn = undefined;
			}
		})();
		return () => {
			isCurrent = false;
		};
	});
</script>

<div class="index" data-drawn={view.drawn ? '' : undefined}>
	<div class="band">
		<p class="title" dir="auto">{card.title}</p>
		<span class="number">{number}</span>
	</div>
	<div class="ruled">
		<div class="lines">
			{#each card.lines as line, index (index)}
				<p class={line.kind} dir="auto">
					{#if line.marker}<span class="marker">{line.marker}</span>{/if}{line.text}
				</p>
			{/each}
		</div>
	</div>
</div>

<style>
	/*
	 * The card's grid scales with the card, so every card fits the same number of lines. The band above the rule holds
	 * the title, and each body line is one rule tall, its baseline just above the rule under it.
	 */
	.index {
		--band: max(30px, 11cqw);
		--rule-width: max(2px, 0.6cqw);
		--line: max(20px, 7cqw);
		--inset: 6cqw;

		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: inherit;
	}

	.band {
		display: flex;
		align-items: flex-start;
		gap: 3cqw;
		box-sizing: border-box;
		height: var(--band);
		padding: 0 4cqw 0 var(--inset);
		border-bottom: var(--rule-width) solid var(--rule);
	}

	.title {
		flex: 1;
		min-width: 0;
		align-self: flex-end;
		margin: 0 0 1.4cqw;
		overflow: hidden;
		font-family: var(--display-font);
		font-weight: 600;
		font-size: max(20px, 5cqw);
		line-height: 1.2;
		letter-spacing: -0.01em;
		color: var(--heading);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.number {
		flex: none;
		margin-top: 3.4cqw;
		font-family: var(--code-font);
		font-size: 12.5px;
		line-height: 1;
		color: var(--muted);
	}

	.ruled {
		flex: 1;
		min-height: 0;
		padding: 0 var(--inset);
		background-image: repeating-linear-gradient(
			to bottom,
			transparent 0,
			transparent calc(var(--line) - 1px),
			color-mix(in oklab, var(--border) 60%, transparent) calc(var(--line) - 1px),
			color-mix(in oklab, var(--border) 60%, transparent) var(--line)
		);
	}

	/* Six lines, the last ending in an ellipsis when the slide has more. */
	.lines {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		overflow: hidden;
		font-size: max(14px, 3.4cqw);
		line-height: var(--line);
		color: var(--body);
		overflow-wrap: anywhere;
		translate: 0 calc(var(--line) / 2 - 0.5em);
	}

	/* On a card under 300 px wide, as on a phone or beside the note on a tablet, the lines' floor of 20 px leaves room for fewer. */
	@container (width < 300px) {
		.lines {
			-webkit-line-clamp: 5;
			line-clamp: 5;
		}
	}

	@container (width < 240px) {
		.lines {
			-webkit-line-clamp: 4;
			line-clamp: 4;
		}
	}

	.lines p {
		margin: 0;
	}

	.marker {
		margin-inline-end: 0.5em;
		color: var(--accent);
	}

	.code {
		overflow: hidden;
		font-family: var(--code-font);
		font-size: 0.9em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
