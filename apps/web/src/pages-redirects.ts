import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

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

/**
 * Answers a request a rewrite matches with the rewrite target's response, as Pages does, by handing the request on
 * with the target as its URL.
 */
export function rewriteRequests(rewrites: Rewrite[]): Connect.NextHandleFunction {
	return (request, _response, next) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const target = rewriteTarget(rewrites, url.pathname);
		if (target && (request.method === 'GET' || request.method === 'HEAD')) request.url = target + url.search;
		next();
	};
}

/**
 * Applies `static/_redirects` rewrites in `vite preview`, which otherwise answers a path with no route with HTTP 404
 * where Pages serves the rewrite target with 200.
 */
export function pagesRedirects(): Plugin {
	return {
		name: 'sld-pages-redirects',
		configurePreviewServer(server) {
			const text = readFileSync(path.join(server.config.root, 'static/_redirects'), 'utf8');
			server.middlewares.use(rewriteRequests(parseRewrites(text)));
		}
	};
}
