import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

// The browser tests run on the dev server, which is never a release build, so both footers show `dev`.
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const commitUrl = `https://github.com/desertthunder/sld/commit/${head}`;

for (const { name, path } of [
	{ name: 'landing page', path: '/' },
	{ name: 'deck library', path: '/app' }
]) {
	test(`the ${name} footer shows a dev build and its commit`, async ({ page }) => {
		await page.goto(path);
		const footer = page.getByRole('contentinfo');
		await expect(footer).toContainText(`dev (${head.slice(0, 7)})`, { timeout: 30_000 });
		await expect(footer.getByRole('link', { name: head.slice(0, 7), exact: true })).toHaveAttribute(
			'href',
			commitUrl
		);
		await expect(footer.getByRole('link', { name: 'dev' })).toHaveCount(0);
	});
}
