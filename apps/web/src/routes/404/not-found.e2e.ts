import { expect, test } from '@playwright/test';

// The dev server serves the page at /404; on Pages the build's `404.html` answers every unknown path.
test('says the page is not found and links home, to the app and to the repository', async ({ page }) => {
	await page.goto('/404');
	await expect(page).toHaveTitle('Page not found · sld');
	await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('link', { name: 'Open App' })).toHaveAttribute('href', '/app');
	const github = page.getByRole('link', { name: 'sld on GitHub' });
	await expect(github).toHaveAttribute('href', 'https://github.com/desertthunder/sld');
	await expect(github).toHaveAttribute('target', '_blank');
	await expect(github).toHaveAttribute('rel', 'noopener');
	await expect(github.locator('.icon')).toBeVisible();
});
