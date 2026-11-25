<script lang="ts">
	import '@fontsource-variable/hubot-sans/wght.css';
	import '@fontsource-variable/mona-sans/wght.css';
	import { resolve } from '$app/paths';
	import '#lib/scheme.css';
	import { appName } from '#lib/app-info.ts';

	const heading = 'Page not found';
	const repositoryUrl = 'https://github.com/desertthunder/sld';
</script>

<svelte:head>
	<title>{heading} · {appName}</title>
</svelte:head>

<div class="scheme">
	<div class="page">
		<header class="nav">
			<a class="mark" href={resolve('/')}>{appName}</a>
			<a class="github" href={repositoryUrl} target="_blank" rel="noopener" aria-label="{appName} on GitHub">
				<span class="i-ri-github-fill icon" aria-hidden="true"></span>
			</a>
		</header>

		<main class="missing">
			<div class="card">
				<h1>{heading}</h1>
				<p>There’s nothing at this address. Your decks are in the app.</p>
				<div class="actions">
					<a class="button" href={resolve('/app')}>Open App</a>
					<a class="ghost" href={resolve('/')}>Home</a>
				</div>
			</div>
		</main>
	</div>
</div>

<style>
	.page {
		--ui-font: 'Mona Sans Variable', system-ui, sans-serif;
		--display-font: 'Hubot Sans Variable', 'Mona Sans Variable', system-ui, sans-serif;

		display: flex;
		flex-direction: column;
		min-height: 100vh;
		box-sizing: border-box;
		padding: 0 48px;
		background: var(--bg);
		color: var(--body);
		font-family: var(--ui-font);
		font-size: 18px;
		line-height: 1.55;
		-webkit-font-smoothing: antialiased;
	}

	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: 100%;
		max-width: 1200px;
		min-height: 88px;
		margin: 0 auto;
	}

	.mark {
		font-family: var(--display-font);
		font-weight: 700;
		font-size: 30px;
		letter-spacing: -0.03em;
		color: var(--heading);
		text-decoration: none;
	}

	.github {
		display: inline-flex;
		padding: 8px;
		border-radius: 10px;
		color: var(--muted);
	}

	.github:hover {
		color: var(--heading);
	}

	.icon {
		width: 28px;
		height: 28px;
	}

	.missing {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 0 112px;
	}

	.card {
		position: relative;
		width: 100%;
		max-width: 520px;
		padding: 40px 36px 32px;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		box-shadow:
			0 2px 3px var(--shadow),
			0 20px 44px var(--shadow);
	}

	.card::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		height: 3px;
		border-radius: 12px 12px 0 0;
		background: var(--rule);
	}

	h1 {
		margin: 0 0 10px;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 36px;
		line-height: 1.15;
		letter-spacing: -0.02em;
		color: var(--heading);
	}

	p {
		margin: 0 0 24px;
		max-width: 44ch;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
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
	}

	.button {
		background: var(--link);
		color: var(--on-primary);
	}

	.button:hover {
		filter: brightness(1.08);
	}

	.ghost {
		padding: 0 20px;
		border: 1px solid var(--border);
		color: var(--body);
	}

	.ghost:hover {
		color: var(--heading);
	}

	:is(.button, .ghost, .mark, .github):focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	@media (max-width: 640px) {
		.page {
			padding: 0 20px;
		}

		.card {
			padding: 32px 24px 24px;
		}

		h1 {
			font-size: 28px;
		}
	}
</style>
