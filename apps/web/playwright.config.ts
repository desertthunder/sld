import { defineConfig, devices } from '@playwright/test';

// The browser tests import the app's own modules by URL, which only the dev server serves.
const port = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
	testDir: 'src',
	testMatch: '**/*.e2e.ts',
	outputDir: 'test-results',
	reporter: 'list',
	forbidOnly: Boolean(process.env.CI),
	use: { baseURL: `http://localhost:${port}` },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `pnpm exec vite dev --port ${port} --strictPort`,
		url: `http://localhost:${port}/app`,
		reuseExistingServer: false
	}
});
