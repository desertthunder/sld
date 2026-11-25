import { expect } from '@playwright/test';
import type * as DatabaseModule from '#lib/database.ts';
import { test } from './page-errors.ts';

// The dev server serves the app's modules at their source paths.
const modules = { database: '/src/lib/database.ts' };

test.fail('a failed query that nothing handles fails the test', async ({ page, context }) => {
	await page.goto('/app');
	await expect(page.getByRole('heading', { level: 1, name: 'sld', exact: true })).toBeVisible({ timeout: 30_000 });
	const rejected = context.waitForEvent('weberror');
	await page.evaluate(async (url) => {
		const { openDatabase } = (await import(url)) as typeof DatabaseModule;
		const database = await openDatabase();
		void database.$client.query('select * from no_such_table');
	}, modules.database);
	await rejected;
});
