import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://sld.example';

function loadWorker(fetch: (request: Request) => Promise<Response>) {
	type FetchEvent = { request: Request; respondWith: (response: Promise<Response>) => void };
	const handlers = new Map<string, (event: FetchEvent) => void>();
	const code = readFileSync(new URL('../../static/isolation-worker.js', import.meta.url), 'utf8');
	runInNewContext(code, {
		addEventListener: (type: string, handler: (event: FetchEvent) => void) => {
			handlers.set(type, handler);
		},
		location: new URL(`${origin}/isolation-worker.js`),
		fetch,
		Headers,
		Response,
		URL
	});
	const fetchHandler = handlers.get('fetch');
	if (!fetchHandler) throw new Error('The worker has no fetch handler');
	return (request: Request) => {
		let response: Promise<Response> | undefined;
		fetchHandler({ request, respondWith: (value) => (response = value) });
		return response;
	};
}

const shell = async () =>
	new Response('<!doctype html>', {
		status: 404,
		headers: { 'Content-Type': 'text/html', 'Cross-Origin-Embedder-Policy': 'credentialless' }
	});

describe('the isolation worker', () => {
	it('re-serves same-origin responses with require-corp, keeping status and body', async () => {
		const handle = loadWorker(shell);
		const response = await handle(new Request(`${origin}/app/deck/1`));
		expect(response?.status).toBe(404);
		expect(response?.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
		expect(response?.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
		expect(response?.headers.get('Content-Type')).toBe('text/html');
		await expect(response?.text()).resolves.toBe('<!doctype html>');
	});

	it.each([204, 205, 304])(
		're-serves a %i response without a body, keeping the isolation headers',
		async (status) => {
			// WebKit hands the worker a body stream even for a null-body status such as a revalidated 304, and copying that
			// stream into a new response throws, so the page's request fails.
			const response = {
				status,
				statusText: '',
				headers: new Headers({ ETag: '"1"', 'Cross-Origin-Embedder-Policy': 'credentialless' }),
				body: new ReadableStream()
			} as unknown as Response;
			const handle = loadWorker(async () => response);
			const served = await handle(new Request(`${origin}/_app/immutable/workers/database-worker.js`));
			expect(served?.status).toBe(status);
			expect(served?.body).toBeNull();
			expect(served?.headers.get('ETag')).toBe('"1"');
			expect(served?.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
		}
	);

	it('passes an opaque redirect through, since a response with status 0 cannot be copied', async () => {
		// `Response.error()` stands in for the opaque redirect a navigation gets: both have status 0.
		const redirect = Response.error();
		const handle = loadWorker(async () => redirect);
		await expect(handle(new Request(`${origin}/old-path`))).resolves.toBe(redirect);
	});

	it('leaves responses that do not ask for credentialless unchanged', async () => {
		const other = new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
		const handle = loadWorker(async () => other);
		const response = await handle(new Request(`${origin}/`));
		expect(response).toBe(other);
		expect(response?.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
	});

	it('leaves cross-origin and non-GET requests to the browser', () => {
		const fetch = vi.fn(shell);
		const handle = loadWorker(fetch);
		expect(handle(new Request('https://images.example/cat.png'))).toBeUndefined();
		expect(handle(new Request(`${origin}/upload`, { method: 'POST' }))).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	});
});
