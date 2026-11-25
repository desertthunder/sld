import { rewriteTarget, type Rewrite } from './pages-redirects.ts';

export type PagesAnswer = { status: number; file: string };

export type HeaderRule = { pattern: string; headers: Record<string, string> };

/** The file Pages serves for `pathname` with pretty URLs: `/x` from `x.html` or `x/index.html`. */
function assetFor(files: ReadonlySet<string>, pathname: string): string | undefined {
	const name = pathname.replaceAll(/^\/+|\/+$/g, '');
	const candidates = name ? [name, `${name}.html`, `${name}/index.html`] : ['index.html'];
	return candidates.find((candidate) => files.has(candidate));
}

/**
 * What Cloudflare Pages answers for a GET of `pathname` from a build holding `files` (paths relative to the build, such
 * as `app.html`), leaving out its redirects from `.html` URLs to pretty ones. A rewrite serves its target with status
 * 200. A path with no file gets the nearest `404.html` above it with status 404, and when the build has no `404.html`
 * at its top, Pages treats it as a single-page app and serves `index.html` with status 200 instead.
 */
export function pagesAnswer(files: ReadonlySet<string>, rewrites: Rewrite[], pathname: string): PagesAnswer {
	const file = assetFor(files, rewriteTarget(rewrites, pathname) ?? pathname);
	if (file) return { status: 200, file };
	if (!files.has('404.html')) return { status: 200, file: 'index.html' };
	const folders = pathname.split('/').filter(Boolean).slice(0, -1);
	for (let depth = folders.length; depth > 0; depth--) {
		const notFound = `${folders.slice(0, depth).join('/')}/404.html`;
		if (files.has(notFound)) return { status: 404, file: notFound };
	}
	return { status: 404, file: '404.html' };
}

/** Reads the rules from a Cloudflare Pages `_headers` file: a URL pattern, then its headers indented below it. */
export function parseHeaderRules(text: string): HeaderRule[] {
	const rules: HeaderRule[] = [];
	for (const line of text.split('\n')) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		if (/^\s/.test(line)) {
			const [name, ...value] = line.trim().split(':');
			const rule = rules.at(-1);
			if (rule && name && value.length > 0) rule.headers[name.trim()] = value.join(':').trim();
		} else rules.push({ pattern: line.trim(), headers: {} });
	}
	return rules;
}

function escapeRegExp(text: string): string {
	return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/** Whether a `_headers` URL pattern matches `pathname`, as Pages matches a `*` splat. */
function isMatch(pattern: string, pathname: string): boolean {
	const parts = pattern.split('*').map((part) => escapeRegExp(part));
	return new RegExp(`^${parts.join('.*')}$`).test(pathname);
}

/** The headers every rule whose pattern matches `pathname` adds. */
export function headersFor(rules: HeaderRule[], pathname: string): Record<string, string> {
	return Object.assign(
		{},
		...rules.filter(({ pattern }) => isMatch(pattern, pathname)).map(({ headers }) => headers)
	);
}
