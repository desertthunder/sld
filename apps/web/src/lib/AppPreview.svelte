<script lang="ts">
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { schemeStyle } from '#lib/scheme-style.ts';

	let { scheme }: { scheme: Scheme } = $props();
</script>

<!-- A picture of the app in the scheme, not a working copy of it, so it stays out of the accessibility tree. -->
<div class="mock" style={schemeStyle(scheme)} aria-hidden="true">
	<div class="bar"><b>Decks</b><span class="primary">New deck</span></div>
	<div class="body">
		<div class="list">
			<div class="selected">Field notes on sleep</div>
			<div>Quarterly review</div>
			<div class="secondary">Reading group, week 3</div>
		</div>
		<div class="main">
			<p class="title">Field notes on sleep</p>
			<p class="secondary">6 slides · edited today</p>
			<p class="link">Open in editor</p>
		</div>
	</div>
</div>

<style>
	.mock {
		place-self: center;
		width: 100%;
		max-width: 820px;
		aspect-ratio: 16 / 10;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 8px;
		box-shadow: 0 16px 36px var(--shadow);
		background: var(--canvas);
		color: var(--text);
		font-size: 13px;
	}

	.bar {
		flex: none;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 44px;
		padding: 0 14px;
		border-bottom: 1px solid var(--border);
	}

	b {
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 16px;
		color: var(--heading);
	}

	.primary {
		margin-left: auto;
		padding: 6px 12px;
		border-radius: 7px;
		background: var(--primary);
		color: var(--on-primary);
		font-weight: 600;
	}

	.body {
		flex: 1;
		display: grid;
		grid-template-columns: 30% minmax(0, 1fr);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--panel);
	}

	.list div {
		padding: 8px 10px;
		border-radius: 7px;
	}

	.list .selected {
		background: var(--selected);
		color: var(--heading);
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px;
	}

	p {
		margin: 0;
	}

	.title {
		color: var(--heading);
	}

	.secondary {
		color: var(--secondary);
	}

	.link {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
</style>
