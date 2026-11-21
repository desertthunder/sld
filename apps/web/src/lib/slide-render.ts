import { slideParts, type Frontmatter } from '#lib/deck-markdown.ts';

/** A slide's HTML and the frontmatter block its markdown opens with, if any. */
export type RenderedSlide = { html: string; frontmatter: Frontmatter | undefined };

type Renderer = (markdown: string) => Promise<RenderedSlide>;

/** How many slides `renderSlide` remembers. Each edit makes a new markdown string, so the cache must forget. */
export const cacheSize = 256;

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
 * HTML passes through, since the markdown is the person's own. Results are cached by markdown.
 */
export async function renderSlide(markdown: string): Promise<RenderedSlide> {
	const cached = cache.get(markdown);
	if (cached) {
		cache.delete(markdown);
		cache.set(markdown, cached);
		return cached;
	}
	const render = await loadRenderer();
	const slide = await render(markdown);
	cache.set(markdown, slide);
	if (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
	return slide;
}

async function createRenderer(): Promise<Renderer> {
	const [{ markdownToHtml }, { mdastPlugins, hastPlugins }] = await Promise.all([
		import('satteri'),
		import('#lib/slide-plugins.ts')
	]);
	return async (markdown) => {
		const { frontmatter, body } = slideParts(markdown);
		const { html } = await markdownToHtml(body, {
			mdastPlugins,
			hastPlugins,
			features: { gfm: true, frontmatter: false, directive: false }
		});
		return { html, frontmatter };
	};
}
