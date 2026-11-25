import { expect, test, type Locator, type Page } from '@playwright/test';
import type * as ColorRolesModule from '#lib/color-roles.ts';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts', decks: '/src/lib/decks.ts', colors: '/src/lib/color-roles.ts' };

const slide = '# Focus\n\nThe active line sits under the ring.\n\nA line below it.';

const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const pane = (page: Page) => page.locator('.markdown-editor');
// CodeMirror draws its own blinking cursor, which a screenshot would catch at either phase.
const hideCursor = '.cm-cursorLayer, .cm-cursor { display: none !important; }';

async function openSlide(page: Page) {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.addInitScript(() => localStorage.setItem('sld:slide-list-view', 'headings'));
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	const id = await page.evaluate(
		async ({ urls, slide }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Talk', slides: [slide] });
			return deck.id;
		},
		{ urls: modules, slide }
	);
	await page.goto(`/app/deck/${id}`);
	await expect(editor(page)).toHaveText(/Focus/, { timeout: 30_000 });
	await page.addStyleTag({ content: hideCursor });
}

/** Puts the cursor on the slide's third line, so the active line is one in the middle of the editor. */
async function moveToThirdLine(page: Page) {
	await page.keyboard.press('ControlOrMeta+Home');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
}

/**
 * The color at each edge of the editor, on its outermost pixel and just inside where a 2-pixel ring would end, with the
 * WCAG contrast between them. The left and right edges are read on the active line.
 */
async function edgeContrasts(page: Page, element: Locator) {
	const box = (await element.boundingBox())!;
	const line = (await page.locator('.cm-activeLine').boundingBox())!;
	const width = Math.round(box.width);
	const height = Math.round(box.height);
	const row = Math.round(line.y - box.y + line.height / 2);
	const column = Math.round(width / 2);
	const edges: { name: string; ring: [number, number]; inside: [number, number] }[] = [
		{ name: 'top', ring: [column, 0], inside: [column, 3] },
		{ name: 'right', ring: [width - 1, row], inside: [width - 4, row] },
		{ name: 'bottom', ring: [column, height - 1], inside: [column, height - 4] },
		{ name: 'left', ring: [0, row], inside: [3, row] }
	];
	const screenshot = await element.screenshot();
	const png = screenshot.toString('base64');
	return page.evaluate(
		async ({ png, edges, url }) => {
			const { contrast } = (await import(url)) as typeof ColorRolesModule;
			const image = new Image();
			image.src = `data:image/png;base64,${png}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const hex = ([x, y]: [number, number]) =>
				`#${Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
			return edges.map(({ name, ring, inside }) => {
				const colors = { ring: hex(ring), inside: hex(inside) };
				return { name, ...colors, ratio: contrast(colors.ring, colors.inside) };
			});
		},
		{ png, edges, url: modules.colors }
	);
}

for (const scheme of ['dark', 'light'] as const) {
	test.describe(`in the default ${scheme} scheme`, () => {
		test.beforeEach(async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await openSlide(page);
		});

		test('the unfocused editor draws no ring', async ({ page }) => {
			await expect(pane(page)).toHaveScreenshot(`editor-unfocused-${scheme}.png`);
		});

		test('a click draws a ring at 3:1 on every edge, over the active line', async ({ page }) => {
			await editor(page).click();
			await moveToThirdLine(page);
			await expect(editor(page)).toBeFocused();
			await expect(pane(page)).toHaveScreenshot(`editor-focused-${scheme}.png`);
			const edges = await edgeContrasts(page, pane(page));
			for (const edge of edges) {
				expect(edge.ratio, `${edge.name}: ${edge.ring} on ${edge.inside}`).toBeGreaterThanOrEqual(3);
			}
		});

		test('Tab draws the same ring as a click', async ({ page }) => {
			await editor(page).click();
			await moveToThirdLine(page);
			const clicked = await pane(page).screenshot();
			await page.getByText('Slide 1 · markdown').click();
			await expect(editor(page)).not.toBeFocused();
			await page.keyboard.press('Tab');
			await expect(editor(page)).toBeFocused();
			expect(await pane(page).screenshot()).toEqual(clicked);
		});
	});
}
