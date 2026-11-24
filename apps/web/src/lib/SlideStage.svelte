<script lang="ts">
	import type { Snippet } from 'svelte';
	import '@fontsource-variable/hubot-sans/wght.css';
	import '@fontsource-variable/mona-sans/wght.css';
	import '@fontsource/monaspace-neon/latin-400.css';
	import '@fontsource/monaspace-neon/latin-400-italic.css';
	import '#lib/slide.css';
	import '#lib/code-block.css';
	import type { Scheme } from '#lib/scheme-compiler.ts';
	import { fitSlide, sizeEvents } from '#lib/slide-fit.ts';
	import { slideClasses } from '#lib/slide-meta.ts';
	import type { RenderedSlide } from '#lib/slide-render.ts';
	import Stage from '#lib/Stage.svelte';
	import { defaultAspect, type Aspect, type Fit } from '#lib/stage.ts';

	let {
		slide,
		aspect = defaultAspect,
		scheme,
		schemes = [],
		overflowing = $bindable(false),
		fit = $bindable(1),
		placement = $bindable({ scale: 0, x: 0, y: 0 }),
		overlay
	}: {
		slide: RenderedSlide;
		aspect?: Aspect;
		/** The deck's scheme, which a slide's own `scheme` replaces when it names one of `schemes`. */
		scheme?: Scheme;
		schemes?: readonly Scheme[];
		overflowing?: boolean;
		/** How far the slide shrank its text to fit, from 1 down to `minFit`. */
		fit?: number;
		/** Where the stage sits in its frame, as `Stage` places it. */
		placement?: Fit;
		overlay?: Snippet;
	} = $props();

	let article: HTMLElement | undefined = $state();

	// The slide fits again whenever what it shows or how wide it is changes, once its fonts, images or videos load, and
	// when a disclosure opens or closes, since those change its height without changing its HTML. Fitting
	// writes only custom properties, which none of these watch, so it never sets itself off, and the slide's HTML is
	// never drawn again. A resize of the window scales the stage without changing its layout, so it fits nothing.
	$effect(() => {
		if (!article) return;
		const element = article;
		let isCurrent = true;
		const refit = () => {
			// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Svelte writes a bindable prop by assignment.
			if (isCurrent) fit = fitSlide(element).fit;
		};
		const mutations = new MutationObserver(refit);
		mutations.observe(element, { subtree: true, childList: true, characterData: true, attributeFilter: ['class'] });
		const resizes = new ResizeObserver(refit);
		resizes.observe(element);
		for (const type of sizeEvents) element.addEventListener(type, refit, { capture: true });
		// TODO: spread a font load's refits over frames: it refits every thumbnail in the list in one task.
		document.fonts.addEventListener('loadingdone', refit);
		void document.fonts.ready.then(refit);
		refit();
		return () => {
			isCurrent = false;
			mutations.disconnect();
			resizes.disconnect();
			for (const type of sizeEvents) element.removeEventListener(type, refit, { capture: true });
			document.fonts.removeEventListener('loadingdone', refit);
		};
	});
</script>

<Stage
	{aspect}
	scheme={schemes.find(({ slug }) => slug === slide.meta.scheme) ?? scheme}
	bind:overflowing
	bind:placement>
	<!-- Raw HTML in a slide passes through: the markdown is the person's own. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<article class={slideClasses(slide.meta)} bind:this={article}>{@html slide.html}</article>
	<!-- Drawn on the stage in its pixels, above the slide, and not measured as the slide's content. -->
	{@render overlay?.()}
</Stage>
