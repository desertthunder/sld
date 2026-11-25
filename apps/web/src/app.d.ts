// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Vite's `define` in vite.config.ts replaces it with the version the build is made from.
	const __APP_VERSION__: import('#lib/app-info.ts').BuildVersion;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
