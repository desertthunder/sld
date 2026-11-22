import type { HastPluginList, MdastPluginList } from 'satteri';
import { codeBlocks, type CodeBlockOptions } from '#lib/code-blocks.ts';

/** What a deck sets for how its slides show. */
export type SlideOptions = CodeBlockOptions;

/** The Sätteri plugins that run on every slide's markdown tree, in order. */
export const mdastPlugins: MdastPluginList = [];

/** The Sätteri plugins that run on every slide's HTML tree, in order, after `mdastPlugins`. */
export function hastPlugins(options: SlideOptions): HastPluginList {
	return [codeBlocks(options)];
}
