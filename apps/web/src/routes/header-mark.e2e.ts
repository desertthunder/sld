import { expect, test, type Locator, type Page } from '@playwright/test';
import type * as AppSchemeModule from '#lib/app-scheme.ts';
import type { Palette } from '#lib/color-roles.ts';
import type * as SchemesModule from '#lib/schemes.ts';

// The dev server serves the app's modules at their source paths.
const modules = { appScheme: '/src/lib/app-scheme.ts', schemes: '/src/lib/schemes.ts' };

const widths = [1440, 390] as const;
const appSchemes = ['oxocarbon-dark', 'gruvbox-dark', 'oxocarbon-light', 'catppuccin-latte'] as const;

const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'sld', exact: true });

async function loadFonts(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			['700 24px "Hubot Sans Variable"', '500 15px "Mona Sans Variable"'].map((font) => document.fonts.load(font))
		);
		await document.fonts.ready;
	});
}

/** Chooses the app scheme `slug` as settings does, and returns its Base16 colors. */
function chooseAppScheme(page: Page, slug: string): Promise<Palette> {
	return page.evaluate(
		async ({ urls, slug }) => {
			const { applyAppScheme, storedAppScheme, writeAppScheme } = (await import(
				urls.appScheme
			)) as typeof AppSchemeModule;
			const { loadSchemes } = (await import(urls.schemes)) as typeof SchemesModule;
			const schemes = await loadSchemes();
			const scheme = schemes.find((scheme) => scheme.slug === slug)!;
			const stored = storedAppScheme(scheme);
			writeAppScheme(() => localStorage, stored);
			applyAppScheme(document.documentElement, stored);
			return scheme.colors;
		},
		{ urls: modules, slug }
	);
}

/** `#rrggbb` as the `rgb()` string the browser computes for it. */
function rgb(hex: string) {
	const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
	return `rgb(${r}, ${g}, ${b})`;
}

/** The colors of a screenshot of `element` at points in the mark's 512 grid, cropped to `80 80 352 352`. */
async function markPixels(page: Page, element: Locator, points: Record<string, [number, number]>) {
	const shot = await element.screenshot();
	const png = shot.toString('base64');
	return page.evaluate(
		async ({ png, points }) => {
			const bytes = Uint8Array.from(atob(png), (character) => character.codePointAt(0)!);
			const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const scale = image.width / 352;
			return Object.fromEntries(
				Object.entries(points).map(([name, [x, y]]) => {
					const [r, g, b] = context.getImageData(
						Math.round((x - 80) * scale),
						Math.round((y - 80) * scale),
						1,
						1
					).data;
					return [name, `rgb(${r}, ${g}, ${b})`];
				})
			);
		},
		{ png, points }
	);
}

test.describe('the landing page header', () => {
	for (const width of widths) {
		for (const colorScheme of ['dark', 'light'] as const) {
			test(`at ${width} px in the ${colorScheme} scheme, shows the mark in the brand's colors as pinned`, async ({
				page,
				browserName
			}) => {
				test.skip(browserName !== 'chromium', 'The screenshots are Chromium’s.');
				await page.setViewportSize({ width, height: 900 });
				await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
				await page.goto('/');
				await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({
					timeout: 30_000
				});
				await loadFonts(page);
				await expect(page.getByRole('link', { name: 'sld', exact: true })).toHaveAttribute('href', '#top');
				await expect(page.locator('header.nav')).toHaveScreenshot(`header-landing-${width}-${colorScheme}.png`);
			});
		}
	}
});

test.describe('the /app header', () => {
	for (const width of widths) {
		for (const slug of appSchemes) {
			test(`at ${width} px in ${slug}, shows the mark in the scheme's colors as pinned`, async ({
				page,
				browserName
			}) => {
				test.skip(browserName !== 'chromium', 'The screenshots are Chromium’s.');
				await page.setViewportSize({ width, height: 900 });
				await page.goto('/app');
				await expect(heading(page)).toBeVisible({ timeout: 30_000 });
				await chooseAppScheme(page, slug);
				await page.reload();
				await expect(heading(page)).toBeVisible({ timeout: 30_000 });
				await loadFonts(page);
				await expect(page.locator('header.bar')).toHaveScreenshot(`header-app-${width}-${slug}.png`);
			});
		}
	}

	test('its heading reads "sld", with the mark inside it', async ({ page }) => {
		await page.goto('/app');
		await expect(heading(page)).toBeVisible({ timeout: 30_000 });
		await expect(heading(page).getByRole('img', { name: 'sld', exact: true })).toBeVisible();
		await expect(heading(page)).toHaveAccessibleName('sld');
	});

	test.describe('drawn large', () => {
		test.use({ deviceScaleFactor: 8 });

		test('recolors with the app scheme, and its cut-outs show the header behind it', async ({
			page,
			browserName
		}) => {
			test.skip(browserName !== 'chromium', 'Only Chromium screenshots elements at this scale.');
			await page.goto('/app');
			await expect(heading(page)).toBeVisible({ timeout: 30_000 });
			const mark = heading(page).locator('svg');
			// A color no scheme uses, so a cut-out can only show it by letting the header through.
			const behind = 'rgb(255, 0, 255)';
			await page.locator('header.bar').evaluate((header, color) => (header.style.background = color), behind);
			const points: Record<string, [number, number]> = {
				back: [100, 115],
				middle: [140, 155],
				front: [300, 310],
				track: [380, 395],
				fill: [150, 395],
				gap: [121.6, 200],
				dash: [220.16, 261.12]
			};
			for (const slug of ['gruvbox-dark', 'catppuccin-latte']) {
				const palette = await chooseAppScheme(page, slug);
				const expected = {
					back: rgb(palette.base02),
					middle: rgb(palette.base03),
					front: rgb(palette.base0B),
					track: rgb(palette.base02),
					fill: rgb(palette.base0B),
					gap: behind,
					dash: behind
				};
				await expect.poll(() => markPixels(page, mark, points), { message: slug }).toEqual(expected);
			}
		});
	});
});
