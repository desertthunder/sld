import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Cloudflare Pages serves `index.html` for unknown paths when the build has no `404.html`.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
