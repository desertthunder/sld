import { defineConfig, devices } from '@playwright/test';

// The browser tests import the app's own modules by URL, which only the dev server serves.
const port = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
	testDir: 'src',
	testMatch: '**/*.e2e.ts',
	outputDir: 'test-results',
	reporter: 'list',
	// WebKit takes over 20 seconds for a test that opens the app in two tabs.
	timeout: 90_000,
	forbidOnly: Boolean(process.env.CI),
	use: { baseURL: `http://localhost:${port}` },
	// Screenshots are taken in Chromium on Linux, as CI runs, so their names carry neither. Two machines draw the same
	// slide up to about 140 pixels apart, so the allowance is a few times that and no more.
	expect: {
		toHaveScreenshot: { pathTemplate: '{testDir}/{testFileDir}/__screenshots__/{arg}{ext}', maxDiffPixels: 400 }
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	],
	webServer: {
		command: `pnpm exec vite dev --port ${port} --strictPort`,
		url: `http://localhost:${port}/app`,
		reuseExistingServer: false
	}
});
