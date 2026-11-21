import { slideParts, type Frontmatter } from '#lib/deck-markdown.ts';
import { errorText } from '#lib/error-text.ts';
import type { SlideOptions } from '#lib/slide-plugins.ts';

/** A slide's HTML and the frontmatter block its markdown opens with, if any. */
export type RenderedSlide = { html: string; frontmatter: Frontmatter | undefined };

type Renderer = (markdown: string, options: SlideOptions) => Promise<RenderedSlide>;

const defaultOptions: SlideOptions = { lineNumbers: false };

/** How many slides `renderSlide` remembers. Each edit makes a new markdown string, so the cache must forget. */
export const cacheSize = 256;

/**
 * Sätteri didn't load. Its browser build downloads its WebAssembly while the module loads, and a browser keeps a module
 * that failed to load for the life of the page, so only a reload tries again.
 */
export class RendererLoadError extends Error {
	constructor(cause: unknown) {
		super(errorText(cause), { cause });
		this.name = 'RendererLoadError';
	}
}

const cache = new Map<string, RenderedSlide>();
const renderer: { loading?: Promise<Renderer> } = {};

/** Loads Sätteri on first use, since in the browser it downloads a 3 MB WebAssembly build. */
function loadRenderer(): Promise<Renderer> {
	renderer.loading ??= createRenderer();
	return renderer.loading;
}

/**
 * A slide's HTML and frontmatter. The frontmatter is read as the deck splitter reads it, and only the markdown after
 * it reaches Sätteri, whose own frontmatter support would also swallow a block that doesn't parse. GFM is on, and raw
 * HTML passes through, since the markdown is the person's own. Results are cached by markdown and options.
 */
export async function renderSlide(markdown: string, options: SlideOptions = defaultOptions): Promise<RenderedSlide> {
	const key = `${options.lineNumbers ? 'numbered' : 'plain'}\n${markdown}`;
	const cached = cache.get(key);
	if (cached) {
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}
	const render = await loadRenderer();
	const slide = await render(markdown, options);
	cache.set(key, slide);
	if (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
	return slide;
}

async function createRenderer(): Promise<Renderer> {
	let modules;
	try {
		modules = await Promise.all([import('satteri'), import('#lib/slide-plugins.ts')]);
	} catch (error) {
		throw new RendererLoadError(error);
	}
	const [{ markdownToHtml }, { mdastPlugins, hastPlugins }] = modules;
	return async (markdown, options) => {
		const { frontmatter, body } = slideParts(markdown);
		const { html } = await markdownToHtml(body, {
			mdastPlugins,
			hastPlugins: hastPlugins(options),
			features: { gfm: true, frontmatter: false, directive: false }
		});
		return { html, frontmatter };
	};
}
