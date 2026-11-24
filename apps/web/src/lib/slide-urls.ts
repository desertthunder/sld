import { defineHastPlugin, type HastNode, type HastPluginDefinition } from 'satteri';

/** Where a URL sits in a slide: a link's `href` or an image's `src`. */
export type UrlUse = 'link' | 'image';

const scriptSchemes = new Set(['javascript', 'vbscript']);

/** The `data:` types an image may load. Each is a raster format, which runs no script. */
export const imageDataTypes: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

/**
 * `url` as a browser's URL parser reads its scheme and media type: without the spaces and control characters before
 * it, and without the tabs and newlines inside it. Those a browser also strips from the end never reach either part.
 */
function browserForm(url: string): string {
	let start = 0;
	while (start < url.length && url.codePointAt(start)! <= 0x20) start++;
	return url.slice(start).replaceAll(/[\t\n\r]/g, '');
}

/** A URL's scheme in lowercase, or undefined for a relative URL, which a browser resolves against the page. */
export function urlScheme(url: string): string | undefined {
	return /^([a-z][\d+.a-z-]*):/i.exec(browserForm(url))?.[1]?.toLowerCase();
}

/** The media type a `data:` URL names, in lowercase. */
function dataType(url: string): string {
	const rest = browserForm(url).slice('data:'.length);
	const end = rest.search(/[,;]/);
	return (end === -1 ? rest : rest.slice(0, end)).trim().toLowerCase();
}

/**
 * Whether a slide may keep `url` as a link or image address. Script URLs never stay, and a `data:` URL stays only as
 * an image in one of `imageDataTypes`. Every other scheme, and a URL with none, stays.
 */
export function isAllowedUrl(url: string, use: UrlUse): boolean {
	const scheme = urlScheme(url);
	if (scheme === undefined) return true;
	if (scriptSchemes.has(scheme)) return false;
	if (scheme === 'data') return use === 'image' && imageDataTypes.includes(dataType(url));
	return true;
}

/**
 * The Sätteri plugin that drops the addresses `isAllowedUrl` refuses from the links and images a slide's markdown
 * makes. A refused link shows as its text, and a refused image as its alt text. Raw HTML reaches the tree as raw nodes,
 * which the plugin never visits.
 */
export function safeUrls(): HastPluginDefinition {
	return defineHastPlugin({
		name: 'safe-urls',
		element: {
			filter: ['a', 'img'],
			visit(element, context) {
				const isLink = element.tagName === 'a';
				const url = isLink ? element.properties.href : element.properties.src;
				if (typeof url !== 'string' || isAllowedUrl(url, isLink ? 'link' : 'image')) return;
				if (isLink) {
					context.replaceNode(element, element.children);
					return;
				}
				const alt = element.properties.alt;
				const text: HastNode[] = typeof alt === 'string' && alt !== '' ? [{ type: 'text', value: alt }] : [];
				context.replaceNode(element, text);
			}
		}
	});
}
