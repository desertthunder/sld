import { expect, test, type Page } from '@playwright/test';
import { isolationHeaders } from '#lib/cross-origin-isolation.ts';

/** The rel and address of every icon and manifest link in the page head. */
function iconLinks(page: Page) {
	return page
		.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"]')
		.evaluateAll((links: HTMLLinkElement[]) => links.map((link) => [link.rel, link.getAttribute('href')]));
}

const expectedLinks = [
	['icon', '/favicon.ico'],
	['icon', '/icon.svg'],
	['apple-touch-icon', '/apple-touch-icon.png'],
	['manifest', '/manifest.webmanifest']
];

for (const path of ['/', '/app', '/app/deck/00000000-0000-4000-8000-000000000000']) {
	test(`${path} links the favicon, the touch icon and the manifest, and each loads`, async ({ page }) => {
		await page.goto(path);
		expect(await iconLinks(page)).toEqual(expectedLinks);
		const manifest = await page.request.get('/manifest.webmanifest');
		const { icons } = (await manifest.json()) as { icons: { src: string }[] };
		const urls = [...expectedLinks.map(([, href]) => href!), ...icons.map(({ src }) => src)];
		for (const url of urls) {
			const response = await page.request.get(url);
			expect(response.status(), url).toBe(200);
			for (const [name, value] of Object.entries(isolationHeaders)) {
				expect(response.headers()[name.toLowerCase()], `${name} on ${url}`).toBe(value);
			}
		}
	});
}
