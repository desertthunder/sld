import type { HastPluginList, MdastPluginList } from 'satteri';
import { codeBlocks, type CodeBlockOptions } from '#lib/code-blocks.ts';
import { loneImages } from '#lib/lone-images.ts';
import { safeUrls } from '#lib/slide-urls.ts';

/** What a deck sets for how its slides show. */
export type SlideOptions = CodeBlockOptions;

/** The Sätteri plugins that run on every slide's markdown tree, in order. */
export const mdastPlugins: MdastPluginList = [];

/** The Sätteri plugins that run on every slide's HTML tree, in order, after `mdastPlugins`. */
export function hastPlugins(options: SlideOptions): HastPluginList {
	return [safeUrls(), codeBlocks(options), loneImages()];
}
