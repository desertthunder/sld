// Registered only in browsers that ignore `Cross-Origin-Embedder-Policy: credentialless` (Safari). It serves the
// site's same-origin responses with `require-corp` instead, which those browsers do support, so the page is cross-origin
// isolated. Cross-origin responses pass through unchanged, so a cross-origin image without CORS headers stays blocked.
// TODO: unregister the worker where `credentialless` works, so a browser that gains it stops getting `require-corp`.

async function isolated(request) {
	const response = await fetch(request);
	// Opaque redirects (status 0) can't be copied, and the browser follows them through this worker again.
	if (response.status === 0) return response;
	// The worker outlives the app on its origin, so leave alone another app served there later, such as a different
	// project on a shared localhost port.
	if (response.headers.get('Cross-Origin-Embedder-Policy') !== 'credentialless') return response;
	const headers = new Headers(response.headers);
	headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
	headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

addEventListener('install', () => skipWaiting());

addEventListener('activate', (event) => event.waitUntil(clients.claim()));

addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
	event.respondWith(isolated(request));
});
