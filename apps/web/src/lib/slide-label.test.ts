import { describe, expect, it } from 'vitest';
import { slideLabel, untitledSlide } from '#lib/slide-label.ts';

describe('slideLabel', () => {
	it.for([
		{
			name: 'an ATX heading',
			markdown: '# Field notes on sleep\n\nWhat a month taught me',
			label: 'Field notes on sleep'
		},
		{ name: 'a heading below text', markdown: 'Intro line\n\n## The pattern', label: 'The pattern' },
		{ name: 'a heading with closing marks', markdown: '### Closed ###', label: 'Closed' },
		{ name: 'a setext heading', markdown: 'Why I kept a diary\n===\n\nBody', label: 'Why I kept a diary' },
		{ name: 'a setext heading underlined with dashes', markdown: 'Second level\n---', label: 'Second level' },
		{
			name: 'inline markdown in a heading',
			markdown: '# **Bold** `code` [link](https://x.test)',
			label: 'Bold code link'
		},
		{ name: 'underscore emphasis in a heading', markdown: '# _Why_ __now__', label: 'Why now' },
		{
			name: 'underscores inside words in a heading',
			markdown: '# Rename my_file_name.ts to __init__',
			label: 'Rename my_file_name.ts to init'
		},
		{ name: 'a heading after fenced code', markdown: '```md\n# Not this\n```\n# This one', label: 'This one' },
		{
			name: 'a heading after tilde fenced code',
			markdown: '~~~~\n# Not this\n~~~\n~~~~\n## After',
			label: 'After'
		},
		{ name: 'a heading after frontmatter', markdown: '---\ntitle: x\n---\n# Heading', label: 'Heading' },
		{ name: 'TOML frontmatter', markdown: '+++\nlayout = "center"\n+++\nPlain line', label: 'Plain line' }
	])('names a slide by $name', ({ markdown, label }) => {
		expect(slideLabel(markdown)).toBe(label);
	});

	it('falls back to the first line with text when the slide has no heading', () => {
		expect(slideLabel('\n\n  Just some words  \nMore words')).toBe('Just some words');
		expect(slideLabel('- Late coffee cost me 40 minutes\n- Weekends')).toBe('Late coffee cost me 40 minutes');
		expect(slideLabel('> A quote')).toBe('A quote');
		expect(slideLabel('***\n\nAfter a break')).toBe('After a break');
	});

	it('does not read a list item over dashes as a heading', () => {
		expect(slideLabel('- item\n---\n')).toBe('item');
	});

	it('skips an empty heading', () => {
		expect(slideLabel('#\n\nText')).toBe('Text');
	});

	it('labels a slide with a very long first line quickly', () => {
		const start = performance.now();
		const label = slideLabel(`# ${'*a '.repeat(30_000)}`);
		expect(performance.now() - start).toBeLessThan(1000);
		expect(label.startsWith('*a *a')).toBe(true);
		expect(label.length).toBeLessThanOrEqual(200);
	});

	it('calls a slide with no text untitled', () => {
		expect(slideLabel('')).toBe(untitledSlide);
		expect(slideLabel('  \n\n')).toBe(untitledSlide);
		expect(slideLabel('```\n# only code\n```')).toBe(untitledSlide);
		expect(untitledSlide).toBe('Untitled slide');
	});
});
