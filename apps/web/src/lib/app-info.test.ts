import { describe, expect, it } from 'vitest';
import { appName, appSummary } from '#lib/app-info.ts';

describe('app info', () => {
	it('names the app', () => {
		expect(appName).toBe('sld');
	});

	it('says what the app does in interface copy', () => {
		expect(appSummary).toContain('deck');
		expect(appSummary).toContain('present');
	});
});
