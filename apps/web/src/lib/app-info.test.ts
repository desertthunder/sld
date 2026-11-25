import { describe, expect, it } from 'vitest';
import { appName, appSummary, appVersion, versionLabel } from '#lib/app-info.ts';

describe('app info', () => {
	it('names the app', () => {
		expect(appName).toBe('sld');
	});

	it('says what the app does in interface copy', () => {
		expect(appSummary).toMatch(/\bdeck\b/);
		expect(appSummary).toMatch(/\bpresent\b/);
		expect(appSummary).not.toMatch(/presentation file|\btheme|\brender/i);
	});
});

describe('versionLabel', () => {
	const sha = '0ec2e83c1b9a4f7d2e6a5b8c9d0e1f2a3b4c5d6e';

	it('labels a release with its tag and short commit, linking each on GitHub', () => {
		expect(versionLabel({ tag: 'v0.1.1', sha })).toEqual({
			name: 'v0.1.1',
			nameHref: 'https://github.com/desertthunder/sld/releases/tag/v0.1.1',
			sha: '0ec2e83',
			shaHref: `https://github.com/desertthunder/sld/commit/${sha}`
		});
	});

	it('labels an untagged build dev, with its commit', () => {
		expect(versionLabel({ sha })).toEqual({
			name: 'dev',
			nameHref: undefined,
			sha: '0ec2e83',
			shaHref: `https://github.com/desertthunder/sld/commit/${sha}`
		});
	});

	it('labels a build without a commit dev alone', () => {
		expect(versionLabel({})).toEqual({ name: 'dev', nameHref: undefined, sha: undefined, shaHref: undefined });
	});

	it('carries the version the build was made from', () => {
		expect(appVersion.tag).toBeUndefined();
		expect(appVersion.sha).toMatch(/^[\da-f]{40}$/);
	});
});
