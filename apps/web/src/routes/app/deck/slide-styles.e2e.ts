import { expect, test, type Locator, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type { DeckSettings } from '#lib/deck-settings.ts';
import type * as SlideRenderModule from '#lib/slide-render.ts';
import type * as SlideStylesModule from '#lib/slide-styles.ts';

// The dev server serves the app's modules at their source paths, the same modules the app runs.
const modules = {
	database: '/src/lib/database.ts',
	decks: '/src/lib/decks.ts',
	render: '/src/lib/slide-render.ts',
	styles: '/src/lib/slide-styles.ts'
};

const lines = (...rows: string[]) => rows.join('\n');

const red = 'rgb(255, 0, 0)';
const green = 'rgb(0, 128, 0)';

// Each rule tries to reach past the slide: hide the page, color everything, cover the page or hide the app's controls.
const hostile = lines(
	'<style>',
	'html, body, :root { display: none !important; }',
	`* { color: ${red} !important; }`,
	`h1 { color: ${green} !important; position: fixed; inset: 0; z-index: 2147483647; }`,
	'nav, button, [role="toolbar"], [role="progressbar"], .cm-editor { visibility: hidden !important; }',
	'body:has(&) button, :scope ~ *, & ~ * { display: none !important; }',
	'} body { display: none !important; } x {',
	'</style>',
	'',
	'# Styled',
	'',
	'Slide text'
);

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Creates a deck in the page's database and returns its id. */
async function createDeck(page: Page, slides: string[], settings: DeckSettings = {}): Promise<string> {
	await page.goto('/app');
	await waitForApp(page);
	return page.evaluate(
		async ({ urls, slides, settings }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { createDeck } = (await import(urls.decks)) as typeof DecksModule;
			const deck = await createDeck(await openDatabase(), { title: 'Talk', slides, settings });
			return deck.id;
		},
		{ urls: modules, slides, settings }
	);
}

async function storedSlides(page: Page, id: string): Promise<string[]> {
	return page.evaluate(
		async ({ urls, id }) => {
			const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
			const { listDecksWithSlides } = (await import(urls.decks)) as typeof DecksModule;
			const decks = await listDecksWithSlides(await openDatabase());
			return decks.find((deck) => deck.id === id)!.slides.map(({ markdown }) => markdown);
		},
		{ urls: modules, id }
	);
}

const slideList = (page: Page) => page.getByRole('navigation', { name: 'Slides' });
const previewSlide = (page: Page) => page.getByRole('region', { name: 'Preview' }).locator('article.slide');
const thumbnails = (page: Page) => slideList(page).locator('.thumb');
const editor = (page: Page) => page.getByRole('textbox', { name: /^Markdown for slide/ });
const controls = (page: Page) => page.getByRole('toolbar', { name: 'Presenter controls' });

/** Whether a click at the middle of `target` lands on it rather than on something drawn over it. */
async function isOnTop(target: Locator): Promise<boolean> {
	return target.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return top !== null && element.contains(top);
	});
}

/** Checks the editor around a slide drawn with `hostile`, whose own styles still color its heading and text. */
async function expectEditorUntouched(page: Page) {
	await expect(previewSlide(page).locator('h1')).toHaveCSS('color', green, { timeout: 30_000 });
	await expect(previewSlide(page).locator('p')).toHaveCSS('color', red);
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await expect(page.locator('html')).not.toHaveCSS('display', 'none');
	await expect(slideList(page)).toBeVisible();
	await expect(page.locator('.cm-editor')).toBeVisible();
	const present = page.getByRole('button', { name: /Present/ });
	await expect(present).toBeVisible();
	await expect(present).not.toHaveCSS('color', red);
	await expect(slideList(page).getByRole('button').first()).not.toHaveCSS('color', red);
	expect(await isOnTop(present)).toBe(true);
	expect(await isOnTop(page.locator('.cm-content'))).toBe(true);
}

test("a typed slide's styles color the slide, its preview and its thumbnail, and nothing else", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, ['# Plain', '# Neighbor']);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).locator('h1')).toHaveText('Plain', { timeout: 30_000 });
	await editor(page).fill(hostile);
	await expectEditorUntouched(page);
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveCSS('color', green);
	await expect(thumbnails(page).first().locator('article.slide p')).toHaveCSS('color', red);
	// The next slide's thumbnail keeps its own colors.
	const neighbor = thumbnails(page).nth(1).locator('article.slide h1');
	await expect(neighbor).toHaveText('Neighbor');
	await expect(neighbor).not.toHaveCSS('color', green);
	await expect(neighbor).not.toHaveCSS('color', red);
	await expect.poll(() => storedSlides(page, id)).toEqual([hostile, '# Neighbor']);
});

test("a stored slide's styles can't hide, cover or restyle the presenter's controls", async ({ page }) => {
	const id = await createDeck(page, [hostile, '# Next'], { slideNumber: true });
	await page.goto(`/app/deck/${id}/present`);
	const heading = page.locator('article.slide h1');
	await expect(heading).toHaveCSS('color', green, { timeout: 30_000 });
	await expect(page.locator('article.slide p')).toHaveCSS('color', red);
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	await expect(controls(page)).toBeVisible();
	await expect(page.getByRole('progressbar')).toBeVisible();
	// The slide number is drawn on the stage beside the slide, but isn't part of it.
	const number = page.locator('.number');
	await expect(number).toHaveText('1 / 2');
	await expect(number).toBeVisible();
	await expect(number).not.toHaveCSS('color', red);
	const next = controls(page).getByRole('button', { name: 'Next slide' });
	await expect(next).not.toHaveCSS('color', red);
	expect(await isOnTop(next)).toBe(true);
	await next.click();
	await expect(heading).toHaveText('Next');
	await expect(heading).not.toHaveCSS('color', green);
	expect(await storedSlides(page, id)).toEqual([hostile, '# Next']);
});

test("an imported slide's styles stay on the slide", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/app');
	await waitForApp(page);
	const importButton = page.getByRole('button', { name: 'Import', exact: true });
	await expect(importButton).toBeEnabled();
	const chooser = page.waitForEvent('filechooser');
	await importButton.click();
	const fileChooser = await chooser;
	await fileChooser.setFiles([
		{ name: 'Styled.md', mimeType: 'text/markdown', buffer: Buffer.from(lines(hostile, '', '---', '', '# Next')) }
	]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}(\?|$)/, { timeout: 30_000 });
	await expectEditorUntouched(page);
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveCSS('color', green);
});

test('a slide draws its own content as it did before its styles were scoped', async ({ page }) => {
	const slides = [
		lines(
			'<style>',
			'h1 { color: rgb(0, 0, 255); letter-spacing: 4px; }',
			'.slide { padding: 10px 20px; background: rgb(250, 240, 230); }',
			'article p:first-of-type { font-size: 50px; }',
			'.box { border: 3px solid rgb(1, 2, 3); & strong { color: rgb(9, 8, 7); } }',
			'@media (min-width: 1px) { li { margin-left: 30px; } }',
			'@supports (display: grid) { ul { display: grid; } }',
			'@keyframes wobble { from { opacity: 0.5; } to { opacity: 1; } }',
			'em { animation: wobble 10s infinite paused; }',
			'@layer deck { p { line-height: 2; } }',
			'.slide > div [data-note="a, b"], li:nth-child(2)::marker, body .slide li:last-child { color: rgb(5, 6, 7); }',
			'.slide h1::after { content: "!"; }',
			'</style>',
			'',
			'# Styled',
			'',
			'Big text with *emphasis*.',
			'',
			'<div class="box">A <strong>box</strong> <span data-note="a, b">note</span></div>',
			'',
			'- One',
			'- Two'
		),
		lines(
			'# Drawing',
			'',
			'<svg width="200" height="100"><style>circle { fill: rgb(0, 200, 0); }</style><circle cx="50" cy="50" r="40"></circle></svg>'
		)
	];
	const id = await createDeck(page, slides);
	for (const [index, markdown] of slides.entries()) {
		await page.goto(`/app/deck/${id}/present#${index + 1}`);
		await expect(page.locator('article.slide h1')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('article.slide')).toHaveAttribute('data-slide-scope', /^\w+$/);
		const { scoped, original } = await page.evaluate(
			async ({ url, markdown }) => {
				const properties = [
					'display',
					'color',
					'background-color',
					'font-size',
					'letter-spacing',
					'line-height',
					'padding',
					'margin',
					'border',
					'animation-name',
					'fill'
				];
				const article = document.querySelector('article.slide') as HTMLElement;
				const styles = () =>
					[article, ...article.querySelectorAll(':not(style)')].map((element) => {
						const style = getComputedStyle(element);
						return properties
							.map((property) => `${property}: ${style.getPropertyValue(property)}`)
							.join('; ');
					});
				const scoped = styles();
				const { renderSlide } = (await import(url)) as typeof SlideRenderModule;
				delete article.dataset.slideScope;
				const original = await renderSlide(markdown);
				article.innerHTML = original.html;
				return { scoped, original: styles() };
			},
			{ url: modules.render, markdown }
		);
		expect(scoped).toEqual(original);
	}
	expect(await storedSlides(page, id)).toEqual(slides);
});

test('scoping leaves HTML with no styles alone and names each slide the same wherever it draws', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	const result = await page.evaluate(async (url) => {
		const { scopeSlideStyles } = (await import(url)) as typeof SlideStylesModule;
		const plain = '<h1>Title</h1><p>Text <code>&lt;style&gt;</code></p>';
		const styled = '<style>h1 { color: red; }</style><h1>Title</h1>';
		return {
			plain: scopeSlideStyles(plain),
			plainHtml: plain,
			first: scopeSlideStyles(styled).scope,
			again: scopeSlideStyles(styled).scope,
			other: scopeSlideStyles(`${styled}<p>More</p>`).scope
		};
	}, modules.styles);
	expect(result.plain).toEqual({ html: result.plainHtml, scope: undefined });
	expect(result.first).toMatch(/^\w+$/);
	expect(result.again).toBe(result.first);
	expect(result.other).not.toBe(result.first);
});

test("a slide's style sheet keeps no rule that reaches past the slide", async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	const css = lines(
		'@import url("/app/elsewhere.css");',
		'@property --body { syntax: "<color>"; inherits: false; initial-value: red; }',
		'@font-face { font-family: "Mona Sans Variable"; src: url("/comic.woff2"); }',
		'@font-face { font-family: Deck Serif; src: url("/serif.woff2"); }',
		'@keyframes cm-blink { from { opacity: 0; } to { opacity: 0; } }',
		'@keyframes svelte-1x2y3z-spin { from { opacity: 0; } to { opacity: 0; } }',
		'@keyframes wobble { from { opacity: 0; } to { opacity: 1; } }',
		'@page { margin: 0; }',
		String.raw`h1 { content: "\3c/style><img src=x onerror=globalThis.sldRan=1>"; }`
	);
	const result = await page.evaluate(
		async ({ url, css }) => {
			const { scopeSlideStyles } = (await import(url)) as typeof SlideStylesModule;
			const { html, scope } = scopeSlideStyles(`<style>${css}</style><h1>Title</h1>`);
			const template = document.createElement('template');
			template.innerHTML = html;
			const styles = template.content.querySelectorAll('style');
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(styles[0]?.textContent ?? '');
			return {
				scope,
				styles: styles.length,
				images: template.content.querySelectorAll('img').length,
				rules: [...sheet.cssRules].map((rule) => rule.cssText.split('\n', 1)[0]!.trim())
			};
		},
		{ url: modules.styles, css }
	);
	expect(result.styles).toBe(1);
	expect(result.images).toBe(0);
	expect(result.rules).toEqual([
		expect.stringMatching(/^@font-face \{ font-family: "?Deck Serif"?;/),
		expect.stringMatching(/^@keyframes wobble \{/),
		`@scope ([data-slide-scope="${result.scope}"]) {`
	]);
});

test('a rule that reaches past the slide is dropped wherever it is nested', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	const reaching = lines(
		'@property --base05 { syntax: "<color>"; inherits: false; initial-value: red; }',
		'@font-face { font-family: "Mona Sans Variable"; src: url("/comic.woff2"); }',
		'@keyframes cm-blink { from { opacity: 0; } to { opacity: 0; } }',
		'@page { margin: 0; }',
		'@function --gap() { result: 1px; }'
	);
	const kept = lines(
		'@font-face { font-family: Deck Serif; src: url("/serif.woff2"); }',
		'@keyframes wobble { from { opacity: 0; } to { opacity: 1; } }',
		'h1 { color: red; }'
	);
	const nested = [
		`@media all { ${reaching} ${kept} }`,
		`@supports (display: grid) { @media all { ${reaching} ${kept} } }`,
		`@layer deck { ${reaching} ${kept} }`,
		`@container (min-width: 1px) { ${reaching} ${kept} }`,
		`@scope (h1) { @media all { ${reaching} ${kept} } }`,
		`h1 { @media all { ${reaching} } color: red; }`
	];
	const results = await page.evaluate(
		async ({ url, nested }) => {
			const { scopeSlideStyles } = (await import(url)) as typeof SlideStylesModule;
			return nested.map((css) => {
				const template = document.createElement('template');
				template.innerHTML = scopeSlideStyles(`<style>${css}</style><h1>Title</h1>`).html;
				const sheet = new CSSStyleSheet();
				sheet.replaceSync(template.content.querySelector('style')?.textContent ?? '');
				const found: string[] = [];
				const visit = (rules: CSSRuleList) => {
					for (const rule of rules) {
						if (rule instanceof CSSFontFaceRule)
							found.push(`font ${rule.style.getPropertyValue('font-family')}`);
						else if (rule instanceof CSSKeyframesRule) found.push(`keyframes ${rule.name}`);
						else if (rule instanceof CSSStyleRule) found.push('style');
						else if (!(rule instanceof CSSGroupingRule)) found.push(rule.constructor.name);
						if (rule instanceof CSSGroupingRule) visit(rule.cssRules);
					}
				};
				visit(sheet.cssRules);
				return found;
			});
		},
		{ url: modules.styles, nested }
	);
	const keptRules = ['font "Deck Serif"', 'keyframes wobble', 'style'];
	expect(results).toEqual([keptRules, keptRules, keptRules, keptRules, keptRules, ['style']]);
});

test("a slide's nested at-rules leave the app's colors and fonts alone", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, ['# One']);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).locator('h1')).toHaveText('One', { timeout: 30_000 });
	const appLook = () =>
		page.evaluate(() => ({
			fonts: [...document.fonts].length,
			colors: ['body', '.cm-editor', '.cm-content', 'nav button', '.thumb'].map((selector) => {
				const style = getComputedStyle(document.querySelector(selector)!);
				return `${selector}: ${style.color} on ${style.backgroundColor}`;
			})
		}));
	const before = await appLook();
	await editor(page).fill(
		lines(
			'<style>',
			'@media all {',
			'  @property --base05 { syntax: "<color>"; inherits: false; initial-value: rgb(255, 0, 0); }',
			'  @property --base00 { syntax: "<color>"; inherits: false; initial-value: rgb(255, 0, 0); }',
			'  @font-face { font-family: "Monaspace Neon"; src: local("Comic Sans MS"); }',
			'}',
			'h1 { color: rgb(0, 128, 0); }',
			'</style>',
			'',
			'# Styled'
		)
	);
	await expect(previewSlide(page).locator('h1')).toHaveCSS('color', green, { timeout: 30_000 });
	expect(await appLook()).toEqual(before);
});

test("the app's own fonts and keyframes are ones a slide can't redefine", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, ['# One']);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).locator('h1')).toHaveText('One', { timeout: 30_000 });
	await expect(page.locator('.cm-editor')).toBeVisible();
	const { families, animations, refused } = await page.evaluate(async (url) => {
		const { appFontFamilies, isAppAnimation } = (await import(url)) as typeof SlideStylesModule;
		const sheets = [...document.styleSheets, ...document.adoptedStyleSheets];
		const names: string[] = [];
		const visit = (rules: CSSRuleList) => {
			for (const rule of rules) {
				if (rule instanceof CSSKeyframesRule) names.push(rule.name);
				else if (rule instanceof CSSGroupingRule) visit(rule.cssRules);
			}
		};
		for (const sheet of sheets) visit(sheet.cssRules);
		const families = [
			...new Set([...document.fonts].map(({ family }) => family.replaceAll(/["']/g, '').toLowerCase()))
		];
		return {
			families: families.filter((family) => !appFontFamilies.has(family)),
			animations: names.filter((name) => !isAppAnimation(name)),
			refused: names.length
		};
	}, modules.styles);
	expect(families).toEqual([]);
	expect(animations).toEqual([]);
	expect(refused).toBeGreaterThan(0);
});
