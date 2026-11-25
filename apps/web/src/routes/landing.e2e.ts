import { expect, test, type Page } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import type * as DecksModule from '#lib/decks.ts';
import type * as IndexCardModule from '#lib/index-card.ts';
import type { MigrationProgress } from '#lib/migrate.ts';
import type * as SlideRenderModule from '#lib/slide-render.ts';

declare global {
	function recordMigration(progress: MigrationProgress): void;
}

// The dev server serves the app's modules at their source paths.
const modules = {
	database: '/src/lib/database.ts',
	decks: '/src/lib/decks.ts',
	indexCard: '/src/lib/index-card.ts',
	render: '/src/lib/slide-render.ts'
};

const pasted = '# Talk\n\nIntro\n\n---\n\n## Middle\n\n- One point\n\n---\n\n## End\n';

async function waitForApp(page: Page) {
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
}

function noteBox(page: Page) {
	return page.getByLabel('Your slides as markdown. A --- line starts a new slide.');
}

async function savedDecks(page: Page) {
	return page.evaluate(async (urls) => {
		const { openDatabase } = (await import(urls.database)) as typeof DatabaseModule;
		const { getDeck, listDecks } = (await import(urls.decks)) as typeof DecksModule;
		const database = await openDatabase();
		const decks = await listDecks(database);
		return Promise.all(
			decks.map(async ({ id }) => {
				const deck = await getDeck(database, id);
				return { title: deck?.title, slides: deck?.slides.map(({ markdown }) => markdown) };
			})
		);
	}, modules);
}

/** Collects the migration progress the elected worker posts, on every page load. */
async function recordMigrations(page: Page) {
	const progress: MigrationProgress[] = [];
	await page.exposeFunction('recordMigration', (update: MigrationProgress) => void progress.push(update));
	await page.addInitScript(() => {
		new BroadcastChannel('sld-migrations').addEventListener('message', (event) => recordMigration(event.data));
	});
	return progress;
}

test('a note pasted on the landing page opens in /app as one new deck with the same slides', async ({ page }) => {
	await page.goto('/');
	await noteBox(page).fill(pasted);
	await expect(page.getByText('3 slides', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open as a deck' }).click();
	await expect(page).toHaveURL(/\/app$/);
	await waitForApp(page);
	const expected = [{ title: 'Talk', slides: ['# Talk\n\nIntro', '## Middle\n\n- One point', '## End'] }];
	await expect.poll(() => savedDecks(page), { timeout: 20_000 }).toEqual(expected);
	expect(await page.evaluate(() => sessionStorage.getItem('sld:handoff'))).toBeNull();
	await page.reload();
	await waitForApp(page);
	expect(await savedDecks(page)).toEqual(expected);
});

test('the landing page draws and responds before PGlite has downloaded', async ({ page }) => {
	const { promise: released, resolve: release } = Promise.withResolvers<void>();
	const { promise: held, resolve: hold } = Promise.withResolvers<void>();
	await page.route('**/@electric-sql/pglite/**', async (route) => {
		hold();
		await released;
		await route.continue();
	});
	await page.goto('/');
	await held;
	await expect(page.getByRole('heading', { level: 1, name: 'Easy slides from markdown' })).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Opening decks' })).toBeVisible();
	await noteBox(page).fill('# One\n\n---\n\n# Two');
	await expect(page.getByText('2 slides', { exact: true })).toBeVisible();
	await page.getByRole('textbox', { name: 'Live Preview' }).fill('## Edited');
	await expect(page.getByRole('textbox', { name: 'Live Preview' })).toHaveValue('## Edited');
	release();
	await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({ timeout: 30_000 });
});

test('a warming failure leaves the landing page usable and /app reports it', async ({ page }) => {
	await page.route('**/database-worker.ts*', (route) => route.abort());
	const blocked = page.waitForEvent('requestfailed', (request) => request.url().includes('database-worker'));
	await page.goto('/');
	await blocked;
	await expect(page.getByText('Opening decks')).toBeHidden({ timeout: 20_000 });
	await expect(page.getByText('Decks ready')).toBeHidden();
	await noteBox(page).fill('# One\n\n---\n\n# Two\n\n---\n\n# Three');
	await expect(page.getByText('3 slides', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Open App' }).first().click();
	await expect(page.getByRole('alert')).toContainText("Your decks didn't open", { timeout: 30_000 });
});

test('a database one migration behind is migrated from the landing page, leaving /app nothing to run', async ({
	page
}) => {
	const progress = await recordMigrations(page);
	await page.goto('/app');
	await waitForApp(page);
	// Undo the newest migration, as if the build before it last opened this database.
	const undone = await page.evaluate(async (url) => {
		const { openDatabase, writeDurably } = (await import(url)) as typeof DatabaseModule;
		return writeDurably(await openDatabase(), async ({ $client }) => {
			const { rows } = await $client.query<{ tag: string }>(
				'select tag from migrations order by tag desc limit 1'
			);
			await $client.exec('alter table decks drop column settings;');
			await $client.query('delete from migrations where tag = $1', [rows[0]!.tag]);
			return rows[0]!.tag;
		});
	}, modules.database);
	// The SQL above undoes only this migration, so a newer one needs its own.
	expect(undone).toBe('0002_add_deck_settings');
	progress.length = 0;
	await page.goto('/');
	await expect(page.getByRole('status').filter({ hasText: 'Decks ready' })).toBeVisible({ timeout: 30_000 });
	expect(progress).toEqual([
		{ applied: 0, total: 1 },
		{ applied: 1, total: 1 }
	]);
	progress.length = 0;
	await page.getByRole('link', { name: 'Open App' }).first().click();
	await waitForApp(page);
	await page.reload();
	await waitForApp(page);
	expect(progress).toEqual([]);
	expect(await savedDecks(page)).toEqual([]);
});

/** Waits until every card on the landing page shows its rendered slide, in loaded fonts. */
async function waitForCards(page: Page) {
	const cards = page.locator('.card .index');
	await expect(cards.first()).toHaveAttribute('data-drawn', '', { timeout: 30_000 });
	await expect(page.locator('.card .index:not([data-drawn])')).toHaveCount(0);
	await page.evaluate(async () => {
		await Promise.all(
			['600 24px "Hubot Sans Variable"', '400 16px "Mona Sans Variable"', '400 13px "Monaspace Neon"'].map(
				(font) => document.fonts.load(font)
			)
		);
		await document.fonts.ready;
	});
}

/** A CSS length in pixels, such as a computed `font-size`, as a number. */
const px = (value: string) => Number(value.replace(/px$/, ''));

/** Where a card's parts sit, in pixels from the card's top, measured with the card laid flat. */
function cardLayout(page: Page, selector: string) {
	return page.locator(selector).evaluate((card: HTMLElement) => {
		const style = card.style.cssText;
		card.style.transition = 'none';
		card.style.transform = 'none';
		const cardBox = card.getBoundingClientRect();
		const part = (name: string) => card.querySelector<HTMLElement>(name)!;
		const top = (element: Element) => element.getBoundingClientRect().top - cardBox.top;
		const bottom = (element: Element) => element.getBoundingClientRect().bottom - cardBox.top;
		const [index, title, number, ruled, lines] = ['.index', '.title', '.number', '.ruled', '.lines'].map((name) =>
			part(name)
		);
		const probe = document.createElement('div');
		probe.style.height = 'var(--line)';
		index!.append(probe);
		const rule = probe.getBoundingClientRect().height;
		probe.remove();
		// A zero-size inline block on the baseline marks where each row of text sits.
		const baselines: number[] = [];
		for (const row of lines!.querySelectorAll('p')) {
			const words = row.lastChild!.textContent!.split(' ');
			row.lastChild!.remove();
			for (const word of words) {
				const mark = document.createElement('span');
				mark.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline';
				const wrapper = document.createElement('span');
				wrapper.style.whiteSpace = 'nowrap';
				wrapper.append(mark, word);
				row.append(wrapper, ' ');
				const baseline = top(mark);
				if (baseline < bottom(lines!) && baselines.at(-1) !== baseline) baselines.push(baseline);
			}
		}
		const layout = {
			rule,
			ruleTop: top(ruled!) - (part('.band').offsetHeight - part('.band').clientHeight),
			ruledTop: top(ruled!),
			ruledBottom: bottom(ruled!),
			title: {
				top: top(title!),
				bottom: bottom(title!),
				size: getComputedStyle(title!).fontSize,
				clipped: title!.scrollWidth > title!.clientWidth,
				overflow: getComputedStyle(title!).textOverflow
			},
			number: {
				right: cardBox.right - number!.getBoundingClientRect().right,
				top: top(number!),
				size: getComputedStyle(number!).fontSize,
				font: getComputedStyle(number!).fontFamily
			},
			body: {
				size: getComputedStyle(lines!).fontSize,
				bottom: bottom(lines!),
				clamped: lines!.scrollHeight > lines!.clientHeight + 1,
				baselines
			}
		};
		card.style.cssText = style;
		return layout;
	});
}

const longNote = `# A heading far too long to fit on one index card at any width at all

${'Body text that runs on past the last ruled line of the card. '.repeat(12)}`;

const schemes = ['dark', 'light'] as const;
const widths = [1440, 390] as const;

test.describe('index cards', () => {
	for (const width of widths) {
		for (const scheme of schemes) {
			test(`at ${width} px in the ${scheme} scheme, the cards look as pinned`, async ({ page, browserName }) => {
				test.skip(browserName !== 'chromium', 'The screenshots are Chromium’s.');
				await page.setViewportSize({ width, height: 900 });
				await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
				await page.goto('/');
				await waitForCards(page);
				await expect(page.locator('.fan')).toHaveScreenshot(`cards-fan-${width}-${scheme}.png`);
				await expect(page.locator('.flip')).toHaveScreenshot(`cards-preview-${width}-${scheme}.png`);
			});
		}

		test(`at ${width} px, a too-long heading and body end in an ellipsis on the card`, async ({
			page,
			browserName
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto('/');
			await waitForCards(page);
			await noteBox(page).fill(longNote);
			await expect(page.locator('.fan .card')).toHaveCount(1);
			await expect(page.locator('.fan .title')).toHaveText(/^A heading far too long/);
			await expect(page.locator('.fan .lines p')).toHaveCount(1);
			const layout = await cardLayout(page, '.fan .card');
			expect(layout.title).toMatchObject({ clipped: true, overflow: 'ellipsis' });
			expect(layout.body.clamped).toBe(true);
			expect(layout.body.bottom).toBeLessThanOrEqual(layout.ruledBottom);
			if (browserName === 'chromium')
				await expect(page.locator('.fan')).toHaveScreenshot(`cards-long-${width}.png`);
		});

		test(`at ${width} px, a word too long for a line breaks inside the card`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/');
			await waitForCards(page);
			await noteBox(page).fill(`# Link\n\nhttps://example.com/${'averylongpathwithnobreaks'.repeat(6)}`);
			await expect(page.locator('.fan .lines')).toHaveText(/^https:/);
			const overflow = await page
				.locator('.fan .card')
				.evaluate((card) =>
					[...card.querySelectorAll(':scope .lines p')].map((line) => line.scrollWidth - line.clientWidth)
				);
			expect(overflow).toEqual([0]);
		});
	}

	for (const width of widths) {
		test(`at ${width} px, each card's title sits above the rule and its text on the ruled lines`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/');
			await waitForCards(page);
			const selectors = [1, 2, 3, 4].map((n) => `.fan .card:nth-child(${n})`);
			for (const selector of [...selectors, '.preview-card']) {
				const layout = await cardLayout(page, selector);
				expect(layout.title.bottom, selector).toBeLessThanOrEqual(layout.ruleTop);
				expect(layout.title.top, selector).toBeGreaterThanOrEqual(0);
				const { baselines } = layout.body;
				expect(baselines.length, selector).toBeGreaterThan(0);
				// Each row's baseline sits just above a ruled line, one row to each line.
				for (const [row, baseline] of baselines.entries()) {
					const line = layout.ruledTop + (row + 1) * layout.rule;
					expect(line - baseline, selector).toBeGreaterThan(0);
					expect(line - baseline, selector).toBeLessThan(layout.rule * 0.2);
				}
				expect(layout.body.bottom, selector).toBeLessThanOrEqual(layout.ruledBottom);
				expect(layout.number.font, selector).toMatch(/^"?Monaspace Neon/);
				expect(px(layout.number.size), selector).toBeLessThanOrEqual(13);
				expect(layout.number.right, selector).toBeLessThan(40);
				expect(layout.number.top, selector).toBeLessThan(layout.ruleTop);
				if (width !== 1440) continue;
				expect(px(layout.title.size), selector).toBeGreaterThanOrEqual(20);
				expect(px(layout.body.size), selector).toBeGreaterThanOrEqual(14);
			}
		});
	}
});

test('an index card shows the slide its markdown renders to, and only what the card can show', async ({ page }) => {
	await page.goto('/');
	const cards = await page.evaluate(async (urls) => {
		const { cardText } = (await import(urls.indexCard)) as typeof IndexCardModule;
		const { renderSlide } = (await import(urls.render)) as typeof SlideRenderModule;
		const card = async (markdown: string) => {
			const { html } = await renderSlide(markdown);
			return cardText(html);
		};
		return {
			plain: await card('Intro text\n\n## Later heading\n\nMore'),
			blocks: await card(
				[
					'---',
					'notes: Only for the speaker',
					'---',
					'# The **pattern**',
					'',
					'- Late coffee',
					'  1. Nested',
					'',
					'```ts',
					'',
					'const night = 1;',
					'const day = 2;',
					'```',
					'',
					'![A chart](chart.png)',
					'',
					'| a | b |',
					'| - | - |',
					'| 1 | 2 |',
					'',
					'---',
					'',
					'> A quote'
				].join('\n')
			)
		};
	}, modules);
	expect(cards.plain).toEqual({
		title: 'Later heading',
		lines: [
			{ kind: 'text', text: 'Intro text' },
			{ kind: 'text', text: 'More' }
		]
	});
	expect(cards.blocks).toEqual({
		title: 'The pattern',
		lines: [
			{ kind: 'item', text: 'Late coffee', marker: '•' },
			{ kind: 'item', text: 'Nested', marker: '1.' },
			{ kind: 'code', text: 'const night = 1;' },
			{ kind: 'text', text: 'A quote' }
		]
	});
});

test('the Live Preview card follows its markdown and leaves frontmatter off the card', async ({ page }) => {
	await page.goto('/');
	const preview = page.getByRole('textbox', { name: 'Live Preview' });
	const card = page.locator('.preview-card');
	await expect(card.locator('.index')).toHaveAttribute('data-drawn', '', { timeout: 30_000 });
	await preview.fill('---\nlayout: center\nnotes: Only for the speaker\n---\n# Hi\n\nThere');
	await expect(card.locator('.title')).toHaveText('Hi');
	await expect(card.locator('.lines')).toHaveText('There');
	await expect(card).not.toContainText('Only for the speaker');
});

test('an index card sets a right-to-left heading and text right to left', async ({ page }) => {
	await page.goto('/');
	const card = page.locator('.preview-card');
	await expect(card.locator('.index')).toHaveAttribute('data-drawn', '', { timeout: 30_000 });
	await page.getByRole('textbox', { name: 'Live Preview' }).fill('# שלום עולם\n\nמה שלומך היום');
	await expect(card.locator('.title')).toHaveText('שלום עולם');
	for (const part of [card.locator('.title'), card.locator('.lines p')]) {
		expect(await part.evaluate((element) => getComputedStyle(element).direction)).toBe('rtl');
	}
});

test('when the renderer does not load, the index cards show their markdown on the lines', async ({ page }) => {
	await page.route('**/satteri/**', (route) => route.abort());
	const blocked = page.waitForEvent('requestfailed', (request) => request.url().includes('/satteri/'));
	await page.goto('/');
	await blocked;
	await noteBox(page).fill('# One\n\nFirst point\n\n- A list item');
	const card = page.locator('.fan .card');
	await expect(card.locator('.title')).toHaveText('One');
	await expect(card.locator('.lines p')).toHaveText(['First point', '- A list item']);
	await expect(card.locator('.index')).not.toHaveAttribute('data-drawn');
});
