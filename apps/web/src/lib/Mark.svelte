<script lang="ts">
	import { appName } from '#lib/app-info.ts';

	type Props = {
		/** `brand` draws the mark on its tile in the brand's fixed colors; `scheme` drops the tile and reads Base16 roles. */
		colors: 'brand' | 'scheme';
		/** The mark's width and height in CSS pixels. */
		size: number;
	};

	let { colors, size }: Props = $props();

	// Every mark on a page needs its own mask ids, or one mark's cut-outs would draw through another's.
	const id = $props.id();
	const hasTile = $derived(colors === 'brand');
</script>

<svg
	class={['mark', colors]}
	viewBox={hasTile ? '0 0 512 512' : '80 80 352 352'}
	width={size}
	height={size}
	role="img"
	aria-label={appName}>
	<defs>
		<mask id="{id}-back" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
			<rect width="512" height="512" fill="white" />
			<rect x="115.2" y="130.56" width="281.6" height="168.96" rx="33.28" fill="black" />
		</mask>
		<mask id="{id}-middle" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
			<rect width="512" height="512" fill="white" />
			<rect x="151.04" y="176.64" width="281.6" height="168.96" rx="33.28" fill="black" />
		</mask>
		<mask id="{id}-front" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
			<rect width="512" height="512" fill="white" />
			<rect x="194.56" y="249.6" width="51.2" height="23.04" rx="11.52" fill="black" />
			<rect x="266.24" y="249.6" width="51.2" height="23.04" rx="11.52" fill="black" />
			<rect x="337.92" y="249.6" width="51.2" height="23.04" rx="11.52" fill="black" />
		</mask>
	</defs>
	{#if hasTile}
		<rect class="tile" width="512" height="512" rx="115.2" />
	{/if}
	<rect class="back" x="92.16" y="97.28" width="256" height="143.36" rx="20.48" mask="url(#{id}-back)" />
	<rect class="middle" x="128" y="143.36" width="256" height="143.36" rx="20.48" mask="url(#{id}-middle)" />
	<rect class="front" x="163.84" y="189.44" width="256" height="143.36" rx="20.48" mask="url(#{id}-front)" />
	<rect class="track" x="92.16" y="384" width="327.68" height="23.04" rx="11.52" />
	<rect class="fill" x="92.16" y="384" width="133.12" height="23.04" rx="11.52" />
</svg>

<style>
	.mark {
		display: block;
		flex: none;
	}

	/* The landing page's brand colors are a recorded exception to reading scheme colors. */
	.brand {
		--mark-tile: #1b1e2b;
		--mark-back: #3a3f58;
		--mark-middle: #5b6078;
		--mark-front: #37f499;
	}

	.scheme {
		--mark-back: var(--base02);
		--mark-middle: var(--base03);
		--mark-front: var(--base0B);
	}

	.tile {
		fill: var(--mark-tile);
	}

	.back,
	.track {
		fill: var(--mark-back);
	}

	.middle {
		fill: var(--mark-middle);
	}

	.front,
	.fill {
		fill: var(--mark-front);
	}
</style>
