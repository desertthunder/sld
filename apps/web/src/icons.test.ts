import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const staticFile = (name: string) => readFileSync(new URL(`../static/${name}`, import.meta.url));

/** The width and height in a PNG's header chunk. */
function pngSize(png: Buffer): [number, number] {
	expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
	return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('manifest.webmanifest', () => {
	const manifest = JSON.parse(staticFile('manifest.webmanifest').toString('utf8')) as {
		name: string;
		background_color: string;
		theme_color: string;
		icons: { src: string; sizes: string; type: string; purpose: string }[];
	};

	it('names the app and gives the brand colors', () => {
		expect(manifest.name).toBe('sld');
		expect(manifest.background_color).toBe('#1b1e2b');
		expect(manifest.theme_color).toBe('#1b1e2b');
	});

	it('offers the 192 and 512 px icons both as they are and as maskable', () => {
		const offered = manifest.icons.map(({ sizes, purpose, type }) => `${sizes} ${purpose} ${type}`);
		expect(offered.toSorted((a, b) => a.localeCompare(b))).toEqual([
			'192x192 any image/png',
			'192x192 maskable image/png',
			'512x512 any image/png',
			'512x512 maskable image/png'
		]);
	});

	it('points each icon at a PNG of the size it claims', () => {
		for (const { src, sizes } of manifest.icons) {
			expect(src).toMatch(/^\/[\w-]+\.png$/);
			const [width, height] = pngSize(staticFile(src.slice(1)));
			expect(`${width}x${height}`).toBe(sizes);
		}
	});

	it('draws the maskable icons with a background that runs edge to edge', () => {
		for (const { src, purpose } of manifest.icons) {
			if (purpose !== 'maskable') continue;
			// Color type 2 is RGB with no alpha channel, so no pixel is transparent.
			expect(staticFile(src.slice(1)).readUInt8(25)).toBe(2);
		}
	});
});

describe('favicon.ico', () => {
	it('holds a 16 and a 32 px PNG', () => {
		const ico = staticFile('favicon.ico');
		expect(ico.readUInt16LE(2)).toBe(1);
		const count = ico.readUInt16LE(4);
		const sizes = Array.from({ length: count }, (_, index) => {
			const entry = 6 + 16 * index;
			const png = ico.subarray(
				ico.readUInt32LE(entry + 12),
				ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8)
			);
			const [width, height] = pngSize(png);
			expect([ico.readUInt8(entry), ico.readUInt8(entry + 1)]).toEqual([width, height]);
			return width;
		});
		expect(sizes).toEqual([16, 32]);
	});
});

it('serves the touch icon at the size iOS asks for', () => {
	expect(pngSize(staticFile('apple-touch-icon.png'))).toEqual([180, 180]);
});
