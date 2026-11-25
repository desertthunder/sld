import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const staticFile = (name: string) => readFileSync(new URL(`../static/${name}`, import.meta.url));

/** The width and height in a PNG's header chunk. */
function pngSize(png: Buffer): [number, number] {
	expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
	return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

/** The PNG images an ICO file holds, in directory order, checking each entry's width and height. */
function icoFrames(ico: Buffer): Buffer[] {
	expect(ico.readUInt16LE(2)).toBe(1);
	return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
		const entry = 6 + 16 * index;
		const offset = ico.readUInt32LE(entry + 12);
		const png = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
		expect([ico.readUInt8(entry), ico.readUInt8(entry + 1)]).toEqual(pngSize(png));
		return png;
	});
}

/** The `#rrggbb` color of each pixel in an 8-bit RGBA PNG, row by row. */
function pngColors(png: Buffer): string[][] {
	const [width, height] = pngSize(png);
	expect([png.readUInt8(24), png.readUInt8(25)]).toEqual([8, 6]);
	const chunks: Buffer[] = [];
	for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
		if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
			chunks.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
	}
	const data = inflateSync(Buffer.concat(chunks));
	const stride = width * 4;
	let previous = Buffer.alloc(stride);
	return Array.from({ length: height }, (_, y) => {
		const filter = data[y * (stride + 1)];
		const row = Buffer.from(data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let x = 0; x < stride; x++) {
			const left = x < 4 ? 0 : row[x - 4];
			const up = previous[x];
			const upLeft = x < 4 ? 0 : previous[x - 4];
			const guess = left + up - upLeft;
			// A stable sort keeps the order left, up, upper left among ties, as the Paeth filter requires.
			const [paeth] = [left, up, upLeft].toSorted((a, b) => Math.abs(guess - a) - Math.abs(guess - b));
			row[x] += [0, left, up, (left + up) >> 1, paeth][filter];
		}
		previous = row;
		return Array.from({ length: width }, (_, x) => `#${row.subarray(x * 4, x * 4 + 3).toString('hex')}`);
	});
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
	const frames = icoFrames(staticFile('favicon.ico'));

	it('holds a 16 and a 32 px PNG', () => {
		expect(frames.map((png) => pngSize(png)[0])).toEqual([16, 32]);
	});

	it('draws the 16 px frame as the front slide and its three dashes on whole pixels', () => {
		const tile = '#1b1e2b';
		const slide = '#37f499';
		const middleRow = pngColors(frames[0])[7].map((color) => ({ [tile]: '.', [slide]: '#' })[color] ?? '?');
		expect(middleRow.join('')).toBe('..#...#...#...#.');
	});
});

it('serves the touch icon at the size iOS asks for', () => {
	expect(pngSize(staticFile('apple-touch-icon.png'))).toEqual([180, 180]);
});
