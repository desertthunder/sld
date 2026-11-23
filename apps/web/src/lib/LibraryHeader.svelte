<script lang="ts">
	import { resolve } from '$app/paths';
	import { appName } from '#lib/app-info.ts';
</script>

<header class="bar">
	<h1 class="mark">{appName}</h1>
	<nav>
		<a href={resolve('/app')} aria-current="page">Decks</a>
	</nav>
	<div class="end">
		<span class="saved">
			<span class="dot" aria-hidden="true"></span><span class="label">Saved in this browser</span>
		</span>
		<!-- TODO: open the settings page once there is one. -->
		<button class="settings" type="button" disabled aria-label="Settings">
			<span class="i-ri-settings-3-line icon" aria-hidden="true"></span>
		</button>
	</div>
</header>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 24px;
		height: 64px;
		padding: 0 24px;
		box-sizing: border-box;
		border-bottom: 1px solid var(--border);
	}

	.mark {
		margin: 0;
		font-family: var(--display-font);
		font-weight: 700;
		font-size: 24px;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--heading);
	}

	nav {
		display: flex;
		gap: 4px;
	}

	nav a {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 8px;
		color: var(--muted);
		font-weight: 500;
		font-size: 15px;
		text-decoration: none;
	}

	nav a[aria-current='page'] {
		background: var(--surface);
		color: var(--heading);
	}

	nav a:hover {
		color: var(--heading);
	}

	nav a:focus-visible,
	.settings:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.end {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.saved {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--muted);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}

	.settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		opacity: 0.55;
		cursor: not-allowed;
	}

	.icon {
		width: 20px;
		height: 20px;
	}

	@media (max-width: 640px) {
		.bar {
			gap: 12px;
			padding: 0 8px 0 16px;
		}

		/* The status keeps its words for screen readers where only the dot shows. */
		.label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
