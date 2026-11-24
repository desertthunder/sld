import { describe, expect, it } from 'vitest';
import { presentSettings, settingsFromFrontmatter, settingsFrontmatter } from '#lib/deck-settings.ts';
import { splitDeck } from '#lib/deck-markdown.ts';

describe('presentSettings', () => {
	it('fills in the defaults for a deck with no settings', () => {
		// eslint-disable-next-line unicorn/no-null -- A deck with no settings stores null.
		expect(presentSettings(null)).toEqual({ slideNumber: false });
		expect(presentSettings(undefined)).toEqual({ slideNumber: false });
		expect(presentSettings({})).toEqual({ slideNumber: false });
	});

	it('reads a stored slide number setting', () => {
		expect(presentSettings({ slideNumber: true })).toEqual({ slideNumber: true });
		expect(presentSettings({ slideNumber: false })).toEqual({ slideNumber: false });
	});

	it('takes the default for malformed JSON or a setting of the wrong type', () => {
		for (const stored of ['{"slideNumber": true', 'true', 42, true, ['slideNumber'], { slideNumber: 'yes' }]) {
			expect(presentSettings(stored)).toEqual({ slideNumber: false });
		}
	});

	it('keeps settings it does not know out of the result', () => {
		expect(presentSettings({ slideNumber: true, progress: false })).toEqual({ slideNumber: true });
	});
});

describe('settingsFromFrontmatter', () => {
	it('reads slideNumber from YAML deck frontmatter', () => {
		const { frontmatter } = splitDeck('---\ntitle: Talk\nslideNumber: true\n---\n\n# One');
		expect(settingsFromFrontmatter(frontmatter?.data)).toEqual({ slideNumber: true });
	});

	it('reads slideNumber from TOML deck frontmatter', () => {
		const { frontmatter } = splitDeck('+++\ntitle = "Talk"\nslideNumber = false\n+++\n\n# One');
		expect(settingsFromFrontmatter(frontmatter?.data)).toEqual({ slideNumber: false });
	});

	it('sets nothing without frontmatter, without the field, or with a field of the wrong type', () => {
		expect(settingsFromFrontmatter(undefined)).toBeUndefined();
		expect(settingsFromFrontmatter({ title: 'Talk' })).toBeUndefined();
		expect(settingsFromFrontmatter({ slideNumber: 'yes' })).toBeUndefined();
	});
});

describe('settingsFrontmatter', () => {
	it('writes the settings sld knows, which settingsFromFrontmatter reads back', () => {
		expect(settingsFrontmatter({ slideNumber: true })).toEqual({ slideNumber: true });
		expect(settingsFromFrontmatter(settingsFrontmatter({ slideNumber: false }))).toEqual({ slideNumber: false });
	});

	it('writes nothing for no settings, unknown settings or a setting of the wrong type', () => {
		// eslint-disable-next-line unicorn/no-null -- A deck with no settings stores null.
		expect(settingsFrontmatter(null)).toEqual({});
		expect(settingsFrontmatter({ theme: 'dark', slideNumber: 'yes' })).toEqual({});
		expect(settingsFrontmatter([true])).toEqual({});
	});
});
