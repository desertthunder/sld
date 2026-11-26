import { expect, type Locator, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type { DeckSettings } from '#lib/deck-settings.ts';
import type * as SlideRenderModule from '#lib/slide-render.ts';
import type * as SlideStylesModule from '#lib/slide-styles.ts';
import { test } from './page-errors.ts';

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
			'@layer deck { p { line-height: 2; } .slide { color: rgb(10, 20, 30); } }',
			'@media (min-width: 1px) { @supports (display: grid) { .slide { border: 2px solid rgb(4, 5, 6); } } }',
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
		),
		lines(
			'<style>',
			'@namespace svg url("http://www.w3.org/2000/svg");',
			'svg|circle { fill: rgb(0, 0, 200); }',
			'svg|a, h1 { color: rgb(0, 128, 0); }',
			'</style>',
			'',
			'# Namespaced',
			'',
			'<svg width="200" height="100"><circle cx="50" cy="50" r="40"></circle></svg>'
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
		const plain = '<h1>Title</h1><p>Text <code>&lt;style&gt;</code> about data-slide-scope</p>';
		const styled = '<style>h1 { color: red; }</style><h1>Title</h1>';
		const { scope } = scopeSlideStyles(styled);
		return {
			plain: scopeSlideStyles(plain),
			plainHtml: plain,
			forged: scopeSlideStyles(`<p data-slide-scope="${scope}">Text</p><svg DATA-SLIDE-SCOPE="${scope}"></svg>`),
			forgedStyled: scopeSlideStyles(`<style>p { color: red; }</style><p data-slide-scope="${scope}">Text</p>`)
				.html,
			first: scopeSlideStyles(styled).scope,
			again: scopeSlideStyles(styled).scope,
			other: scopeSlideStyles(`${styled}<p>More</p>`).scope
		};
	}, modules.styles);
	expect(result.plain).toEqual({ html: result.plainHtml, scope: undefined });
	// A slide can't name itself, or part of itself, after another slide to take that slide's styles.
	expect(result.forged).toEqual({ html: '<p>Text</p><svg></svg>', scope: undefined });
	expect(result.forgedStyled).toContain('<p>Text</p>');
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
			'.slide h1 { color: rgb(0, 128, 0); }',
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
		// Every family the app's visible text names, fallbacks included, as well as each one it loads.
		const named = [...document.body.querySelectorAll('*')]
			.filter((element) => {
				const box = element.getBoundingClientRect();
				const hasText = [...element.childNodes].some(
					(node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()
				);
				return hasText && element.checkVisibility() && box.width > 1 && box.height > 1;
			})
			.flatMap((element) => getComputedStyle(element).fontFamily.split(','));
		const loaded = [...document.fonts].map(({ family }) => family);
		const generic = new Set(['system-ui', 'sans-serif', 'monospace']);
		const families = [
			...new Set(
				[...named, ...loaded]
					.map((family) => family.replaceAll(/["']/g, '').trim().toLowerCase())
					.filter((family) => !generic.has(family))
			)
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

// Each link tries to load a style sheet that hides the page and its controls.
const linked = lines(
	'<link rel="stylesheet" href="/hostile.css">',
	'<link REL="Stylesheet" href="/hostile.css?upper">',
	'<link rel="alternate stylesheet" title="Alternate" href="/hostile.css?alternate">',
	`<link rel="preload" as="style" href="/hostile.css?preload" onload="this.rel='stylesheet'">`,
	'',
	'# Linked',
	'',
	'Slide text'
);

// Each popover would open in the top layer, above the app's controls, if it kept its attributes.
const popovers = lines(
	'<div popover id="note">Popover note</div>',
	'<div popover="manual" id="manual">Manual note</div>',
	'',
	'<button popovertarget="note">Open note</button>',
	'<input type="button" popovertarget="manual" popovertargetaction="show" value="Show note">',
	'',
	'# Popovers'
);

// Each button would open the dialog as a modal in the top layer, leaving the app inert, if it kept its command.
const invokers = lines(
	'<dialog id="dialog"><p>Dialog note</p></dialog>',
	'',
	'<button commandfor="dialog" command="show-modal">Open dialog</button>',
	'<button COMMANDFOR="dialog" COMMAND="show-modal">Open loud dialog</button>',
	'',
	'# Invokers'
);

/** Serves `/hostile.css`, and returns the address of each request for it the page makes. */
async function serveHostileCss(page: Page): Promise<string[]> {
	const requested: string[] = [];
	await page.route('**/hostile.css*', async (route) => {
		requested.push(route.request().url());
		await route.fulfill({
			contentType: 'text/css',
			body: lines(
				'html, body { display: none !important; }',
				`* { color: ${red} !important; }`,
				'nav, button, [role="toolbar"], [role="progressbar"], .cm-editor { visibility: hidden !important; }'
			)
		});
	});
	return requested;
}

/** Checks that the page draws no popover in the top layer and that `target` is still on top. */
async function expectNoPopover(page: Page, target: Locator) {
	expect(await page.evaluate(() => document.querySelectorAll(':popover-open, [popover]').length)).toBe(0);
	expect(await isOnTop(target)).toBe(true);
}

/** Checks that the page has no open dialog or invoker command, and that `target` is on top and still takes clicks. */
async function expectNoDialog(page: Page, target: Locator) {
	expect(
		await page.evaluate(() => document.querySelectorAll('dialog[open], :modal, [command], [commandfor]').length)
	).toBe(0);
	expect(await isOnTop(target)).toBe(true);
	expect(await target.evaluate((element) => element.closest('[inert]') === null)).toBe(true);
}

test("a typed slide's style sheet links never load, and stay in its markdown", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const requested = await serveHostileCss(page);
	const id = await createDeck(page, ['# Plain', '# Neighbor']);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).locator('h1')).toHaveText('Plain', { timeout: 30_000 });
	await editor(page).fill(linked);
	await expect(previewSlide(page).locator('h1')).toHaveText('Linked');
	await expect(thumbnails(page).first().locator('article.slide h1')).toHaveText('Linked');
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await expect(slideList(page)).toBeVisible();
	await expect(page.locator('.cm-editor')).toBeVisible();
	const present = page.getByRole('button', { name: /Present/ });
	await expect(present).toBeVisible();
	await expect(present).not.toHaveCSS('color', red);
	expect(await page.locator('article.slide link').count()).toBe(0);
	await expect.poll(() => storedSlides(page, id)).toEqual([linked, '# Neighbor']);

	await page.goto(`/app/deck/${id}/present`);
	await expect(page.locator('article.slide h1')).toHaveText('Linked', { timeout: 30_000 });
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	await expect(controls(page)).toBeVisible();
	await expect(page.getByRole('progressbar')).toBeVisible();
	expect(await isOnTop(controls(page).getByRole('button', { name: 'Next slide' }))).toBe(true);

	await page.goto('/app');
	await waitForApp(page);
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
	expect(requested).toEqual([]);
});

test("a slide's popovers show inline and can't cover the app's controls", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, [popovers, '# Next']);
	await page.goto(`/app/deck/${id}`);
	const preview = previewSlide(page);
	await expect(preview.locator('h1')).toHaveText('Popovers', { timeout: 30_000 });
	await expect(preview.getByText('Popover note')).toBeVisible();
	await expect(preview.getByText('Manual note')).toBeVisible();
	await expect(thumbnails(page).first().getByText('Popover note')).toBeVisible();
	await preview.getByRole('button', { name: 'Open note' }).click();
	await preview.getByRole('button', { name: 'Show note' }).click();
	await expectNoPopover(page, page.getByRole('button', { name: /Present/ }));

	await page.goto(`/app/deck/${id}/present`);
	const slide = page.locator('article.slide');
	await expect(slide.getByText('Popover note')).toBeVisible({ timeout: 30_000 });
	await slide.getByRole('button', { name: 'Open note' }).click();
	await slide.getByRole('button', { name: 'Show note' }).click();
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	await expectNoPopover(page, controls(page).getByRole('button', { name: 'Next slide' }));
	expect(await storedSlides(page, id)).toEqual([popovers, '# Next']);
});

test("a slide's invoker commands can't open its dialog above the app's controls", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const id = await createDeck(page, [invokers, '# Next']);
	await page.goto(`/app/deck/${id}`);
	const preview = previewSlide(page);
	await expect(preview.locator('h1')).toHaveText('Invokers', { timeout: 30_000 });
	await preview.getByRole('button', { name: 'Open dialog' }).click();
	await preview.getByRole('button', { name: 'Open loud dialog' }).click();
	await expect(page.getByText('Dialog note', { exact: true }).filter({ visible: true })).toHaveCount(0);
	await expectNoDialog(page, page.getByRole('button', { name: /Present/ }));
	await expectNoDialog(page, page.locator('.cm-content'));

	await page.goto(`/app/deck/${id}/present`);
	const slide = page.locator('article.slide');
	await expect(slide.locator('h1')).toHaveText('Invokers', { timeout: 30_000 });
	await slide.getByRole('button', { name: 'Open dialog' }).click();
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	await expectNoDialog(page, controls(page).getByRole('button', { name: 'Next slide' }));
	await controls(page).getByRole('button', { name: 'Next slide' }).click();
	await expect(slide.locator('h1')).toHaveText('Next');
	expect(await storedSlides(page, id)).toEqual([invokers, '# Next']);
});

test("an imported slide's invoker commands stay in its markdown and can't open its dialog", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/app');
	await waitForApp(page);
	const importButton = page.getByRole('button', { name: 'Import', exact: true });
	await expect(importButton).toBeEnabled();
	const chooser = page.waitForEvent('filechooser');
	await importButton.click();
	const fileChooser = await chooser;
	await fileChooser.setFiles([{ name: 'Invokers.md', mimeType: 'text/markdown', buffer: Buffer.from(invokers) }]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}(\?|$)/, { timeout: 30_000 });
	const id = /\/app\/deck\/([\da-f-]{36})/.exec(page.url())![1]!;
	await expect(previewSlide(page).locator('h1')).toHaveText('Invokers', { timeout: 30_000 });
	expect(await storedSlides(page, id)).toEqual([invokers]);
	await previewSlide(page).getByRole('button', { name: 'Open dialog' }).click();
	await expect(page.getByText('Dialog note', { exact: true }).filter({ visible: true })).toHaveCount(0);
	await expectNoDialog(page, page.getByRole('button', { name: /Present/ }));
});

test("an imported slide's style sheet links are dropped at import, and its popovers show inline", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const requested = await serveHostileCss(page);
	await page.goto('/app');
	await waitForApp(page);
	const importButton = page.getByRole('button', { name: 'Import', exact: true });
	await expect(importButton).toBeEnabled();
	const chooser = page.waitForEvent('filechooser');
	await importButton.click();
	const fileChooser = await chooser;
	await fileChooser.setFiles([
		{ name: 'Linked.md', mimeType: 'text/markdown', buffer: Buffer.from(lines(linked, '', '---', '', popovers)) }
	]);
	await expect(page).toHaveURL(/\/app\/deck\/[\da-f-]{36}(\?|$)/, { timeout: 30_000 });
	const id = /\/app\/deck\/([\da-f-]{36})/.exec(page.url())![1]!;
	await expect(previewSlide(page).locator('h1')).toHaveText('Linked', { timeout: 30_000 });
	// Import cleaning keeps no `<link>`, so this slide never reaches the drop at render time that a typed slide's does.
	const [stored, storedPopovers] = await storedSlides(page, id);
	expect(stored).not.toContain('<link');
	expect(stored).toContain('# Linked');
	expect(storedPopovers).toEqual(popovers);
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await expect(page.locator('.cm-editor')).toBeVisible();
	await expect(thumbnails(page).nth(1).getByText('Popover note')).toBeVisible();
	await slideList(page)
		.getByRole('button', { name: /Popovers/ })
		.first()
		.click();
	await expect(previewSlide(page).locator('h1')).toHaveText('Popovers');
	await previewSlide(page).getByRole('button', { name: 'Open note' }).click();
	await expectNoPopover(page, page.getByRole('button', { name: /Present/ }));
	expect(requested).toEqual([]);
});

test('only style sheet links, popover attributes and invoker commands leave a slide', async ({ page }) => {
	await page.goto('/app');
	await waitForApp(page);
	const result = await page.evaluate(async (url) => {
		const { scopeSlideStyles } = (await import(url)) as typeof SlideStylesModule;
		const prose = '<p>The popover and command attributes and &lt;link&gt; tag</p>';
		return {
			prose: scopeSlideStyles(prose),
			proseHtml: prose,
			links: scopeSlideStyles(
				[
					'<link rel="stylesheet" href="/a.css">',
					'<LINK REL=" Alternate\tSTYLESHEET " href="/b.css">',
					'<link rel="preload" as=" STYLE " href="/c.css">',
					'<link rel="preload" as="image" href="/d.png">',
					'<p>Text</p>'
				].join('')
			),
			popovers: scopeSlideStyles(
				'<div POPOVER="auto" id="a">A</div><input popovertarget="a" popovertargetaction="toggle" value="B"><p>C</p>'
			),
			commands: scopeSlideStyles(
				'<dialog id="d">A</dialog><button commandfor="d" command="show-modal" type="button">B</button><button COMMAND="--next">C</button>'
			)
		};
	}, modules.styles);
	expect(result.prose).toEqual({ html: result.proseHtml, scope: undefined });
	expect(result.links).toEqual({
		html: '<link rel="preload" as="image" href="/d.png"><p>Text</p>',
		scope: undefined
	});
	expect(result.popovers).toEqual({ html: '<div id="a">A</div><input value="B"><p>C</p>', scope: undefined });
	expect(result.commands).toEqual({
		html: '<dialog id="d">A</dialog><button type="button">B</button><button>C</button>',
		scope: undefined
	});
});

// The parser moves this `<style>` into MathML when it reads the slide's HTML a second time, so its CSS string becomes
// markup: a link, a popover and its button, and a style sheet that was never scoped.
const reparsed = lines(
	'<div><math><mtext><table><mglyph><style>p { content: "<p><link rel=stylesheet href=/hostile.css?reparsed>',
	'<div popover id=reparsed>Reparsed note</div><button popovertarget=reparsed>Open reparsed</button>',
	'<style>body { display: none !important; }</style>"; }</style></mglyph></table></mtext></math></div>',
	'',
	'# Reparsed'
);

test("a slide's HTML can't bring back a link, popover or style sheet when it is parsed again", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const requested = await serveHostileCss(page);
	const id = await createDeck(page, ['# Plain', reparsed]);
	await page.goto(`/app/deck/${id}`);
	await expect(previewSlide(page).locator('h1')).toHaveText('Plain', { timeout: 30_000 });
	await expect(thumbnails(page)).toHaveCount(2);
	await expect(thumbnails(page).nth(1).locator('article.slide')).toBeAttached();
	await page.goto(`/app/deck/${id}/present`);
	await expect(page.locator('article.slide h1')).toHaveText('Plain', { timeout: 30_000 });
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('article.slide h1')).toHaveCount(0);
	await expect(page.locator('body')).not.toHaveCSS('display', 'none');
	await page.mouse.move(200, 200);
	await page.mouse.move(220, 220);
	await expect(controls(page)).toHaveCSS('opacity', '1');
	expect(await page.locator('[popover], [popovertarget], article.slide link').count()).toBe(0);
	expect(requested).toEqual([]);
	expect(await storedSlides(page, id)).toEqual(['# Plain', reparsed]);
});

// A `<style>` the parser moves into MathML when it reads the cleaned HTML again, so `inner` becomes markup.
const confused = (inner: string) =>
	`<math><mtext><table><mglyph><style>p { content: "${inner}"; }</style></mglyph></table></mtext></math>`;

test("a slide's markup that parses into other elements a second time draws nothing, and its noscript is dropped", async ({
	page
}) => {
	await page.goto('/app');
	await waitForApp(page);
	const slides = {
		link: confused('<p><link rel=stylesheet href=/a.css>'),
		popover: confused('<p><div popover>A</div>'),
		command: confused('<p><dialog id=d>A</dialog><button commandfor=d command=show-modal>B</button>'),
		style: confused('<p><style>body { display: none; }'),
		noscript: '<div><noscript><p title="</noscript><link rel=stylesheet href=/a.css>">A</p></noscript>B</div>',
		kept: '<p>A<link rel="stylesheet" href="/a.css">B</p><svg><foreignObject><div><style>p { color: red; }</style></div></foreignObject></svg>'
	};
	const result = await page.evaluate(
		async ({ url, slides }) => {
			const { scopeSlideStyles } = (await import(url)) as typeof SlideStylesModule;
			return Object.fromEntries(Object.entries(slides).map(([name, html]) => [name, scopeSlideStyles(html)]));
		},
		{ url: modules.styles, slides }
	);
	expect(result.link).toEqual({ html: '', scope: undefined });
	expect(result.popover).toEqual({ html: '', scope: undefined });
	expect(result.command).toEqual({ html: '', scope: undefined });
	expect(result.style).toEqual({ html: '', scope: undefined });
	expect(result.noscript).toEqual({ html: '<div>B</div>', scope: undefined });
	expect(result.kept!.html).toMatch(/^<p>AB<\/p><svg><foreignObject><div><style>@scope/);
	expect(result.kept!.scope).toBeDefined();
});
