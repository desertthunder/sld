import { describe, expect, it } from 'vitest';
import { failureNotice, warningNotice } from '#lib/slide-notices.ts';
import { RendererLoadError } from '#lib/slide-render.ts';

describe('warningNotice', () => {
	it('says the frontmatter is ignored, with the parser message', () => {
		expect(
			warningNotice({ kind: 'invalid-frontmatter', format: 'yaml', message: 'Missing closing "quote', line: 3 })
		).toEqual({ parts: [`The frontmatter couldn't be read, so it's ignored: Missing closing "quote`], line: 3 });
	});

	it('carries the line a warning names, and none when it names none', () => {
		expect(warningNotice({ kind: 'unknown-layout', value: 'hero', line: 2 }).line).toBe(2);
		expect(warningNotice({ kind: 'unknown-layout', value: 'hero' })).not.toHaveProperty('line');
	});

	it('shows the values it sets aside as code', () => {
		expect(warningNotice({ kind: 'unknown-layout', value: 'hero' })).toEqual({
			parts: [{ code: 'hero' }, " isn't a layout, so the slide uses the default."]
		});
		expect(warningNotice({ kind: 'invalid-class', value: '1st' })).toEqual({
			parts: [{ code: '1st' }, " isn't a class name, so it's left out."]
		});
		expect(warningNotice({ kind: 'reserved-class', value: 'stage' })).toEqual({
			parts: [{ code: 'stage' }, " is a class sld uses itself, so it's left out."]
		});
		expect(warningNotice({ kind: 'invalid-notes', value: 3 })).toEqual({
			parts: ["The notes aren't text, so the slide has none."]
		});
		expect(warningNotice({ kind: 'invalid-scheme', value: 3 })).toEqual({
			parts: ["The scheme isn't text, so the slide uses the deck's."]
		});
	});

	it('writes a value that is not a string as it reads in the frontmatter', () => {
		expect(warningNotice({ kind: 'unknown-layout', value: 3 }).parts[0]).toEqual({ code: '3' });
		expect(warningNotice({ kind: 'invalid-class', value: { big: true } }).parts[0]).toEqual({
			code: '{"big":true}'
		});
	});
});

describe('failureNotice', () => {
	it('asks for a reload when the parser did not load, and names the error otherwise', () => {
		const offline = new RendererLoadError(new Error('offline'));
		expect(failureNotice(offline)).toEqual({
			parts: ["Slides couldn't be loaded. Reload the page to try again: offline"]
		});
		expect(failureNotice(new Error('Stack overflow'))).toEqual({
			parts: ["This slide couldn't be shown: Stack overflow"]
		});
	});
});
