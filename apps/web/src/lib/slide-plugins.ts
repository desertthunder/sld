import type { HastPluginList, MdastPluginList } from 'satteri';

/** The Sätteri plugins that run on every slide's markdown tree, in order. */
export const mdastPlugins: MdastPluginList = [];

/** The Sätteri plugins that run on every slide's HTML tree, in order, after `mdastPlugins`. */
export const hastPlugins: HastPluginList = [];
