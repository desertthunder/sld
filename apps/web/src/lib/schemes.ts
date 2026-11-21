import type { Scheme, SchemeFile } from '#lib/scheme-compiler.ts';

// TODO: credit tinted-theming and each scheme's author, with the license in `schemes/LICENSE`, on the About screen.

/** Loads every Base16 scheme. The data is a chunk of its own, fetched on first call, so no page bundles it. */
export async function loadSchemes(): Promise<Scheme[]> {
	const { default: file } = await import('#lib/schemes/base16.json');
	return (file as SchemeFile).schemes;
}
