import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export type Rewrite = { from: string; to: string };

/** Reads the rewrites, the rules with status 200, from a Cloudflare Pages `_redirects` file. */
export function parseRewrites(text: string): Rewrite[] {
	return text
		.split('\n')
		.map((line) => line.trim().split(/\s+/))
		.filter(([from, to, status]) => from && !from.startsWith('#') && to && status === '200')
		.map(([from, to]) => ({ from, to }));
}

/** Returns the file the first matching rewrite serves for `pathname`, as Pages matches a trailing `*` splat. */
export function rewriteTarget(rewrites: Rewrite[], pathname: string): string | undefined {
	return rewrites.find(({ from }) =>
		from.endsWith('*') ? pathname.startsWith(from.slice(0, -1)) : pathname === from
	)?.to;
}

/** Returns the build file Pages serves for an asset path, which it may name without its `.html` extension. */
export function assetFile(assetPath: string): string {
	return path.extname(assetPath) ? assetPath : `${assetPath}.html`;
}

/**
 * Applies `static/_redirects` rewrites in `vite preview`, which otherwise answers a path with no route with HTTP 404
 * where Pages serves the rewrite's file with 200.
 */
export function pagesRedirects(): Plugin {
	return {
		name: 'sld-pages-redirects',
		configurePreviewServer(server) {
			const root = server.config.root;
			const rewrites = parseRewrites(readFileSync(path.join(root, 'static/_redirects'), 'utf8'));
			server.middlewares.use((request, response, next) => {
				const target = rewriteTarget(rewrites, new URL(request.url ?? '/', 'http://localhost').pathname);
				if (!target || (request.method !== 'GET' && request.method !== 'HEAD')) return next();
				const file = path.join(root, 'build', assetFile(target));
				response.setHeader('content-type', 'text/html; charset=utf-8');
				response.end(readFileSync(file));
			});
		}
	};
}
