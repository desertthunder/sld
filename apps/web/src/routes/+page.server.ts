import { swatch, swatchSchemes, type Swatch } from '#lib/landing.ts';
import { loadSchemes } from '#lib/schemes.ts';

// The page is prerendered, so this runs only at build time, and the page carries three schemes instead of them all.
export async function load(): Promise<{ swatches: Swatch[] }> {
	const schemes = await loadSchemes();
	const swatches = swatchSchemes.map((slug) => {
		const scheme = schemes.find((candidate) => candidate.slug === slug);
		if (!scheme) throw new Error(`The scheme ${slug} is missing`);
		return swatch(scheme);
	});
	return { swatches };
}
