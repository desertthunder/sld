/**
 * Draws the maskable app icons and the 16 px favicon from the SVG sources in `icons/` into `static/`, and packs
 * `static/favicon.ico` from that 16 px favicon and the brand's 32 px one.
 * Run as `pnpm --filter @sld/web icons`; it needs Playwright's Chromium (`make install`).
 */
import { chromium, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const sources = path.join(root, 'icons');
const output = path.join(root, 'static');

/** Rasterizes an SVG at exactly `size` by `size` pixels, keeping its transparent corners. */
async function rasterize(page: Page, svg: string, size: number): Promise<Buffer> {
	await page.setViewportSize({ width: size, height: size });
	const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
	await page.setContent(
		`<style>html, body { margin: 0; background: transparent; } img { display: block; }</style>` +
			`<img src="${source}" width="${size}" height="${size}" alt="">`
	);
	await page.locator('img').evaluate((image: HTMLImageElement) => image.decode());
	return page.screenshot({ omitBackground: true });
}

/** Packs square PNG images into an ICO file, which may hold PNG data for each size. */
function packIco(images: { size: number; png: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length + 16 * images.length;
	const entries = images.map(({ size, png }) => {
		const entry = Buffer.alloc(16);
		// A width or height of 0 means 256.
		entry.writeUInt8(size % 256, 0);
		entry.writeUInt8(size % 256, 1);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += png.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function main() {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ deviceScaleFactor: 1 });
		const maskable = readFileSync(path.join(sources, 'icon-maskable.svg'), 'utf8');
		for (const size of [192, 512]) {
			writeFileSync(path.join(output, `icon-maskable-${size}.png`), await rasterize(page, maskable, size));
		}
		const favicon16 = await rasterize(page, readFileSync(path.join(sources, 'favicon-16.svg'), 'utf8'), 16);
		const favicon32 = readFileSync(path.join(sources, 'favicon-32.png'));
		writeFileSync(
			path.join(output, 'favicon.ico'),
			packIco([
				{ size: 16, png: favicon16 },
				{ size: 32, png: favicon32 }
			])
		);
	} finally {
		await browser.close();
	}
}

await main();
