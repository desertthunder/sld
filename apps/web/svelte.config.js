import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// `index.html` is the prerendered landing page, so the app shell gets its own file, which
		// `static/_redirects` serves for every path under `/app`.
		adapter: adapter({ fallback: 'app.html' })
	}
};

export default config;
