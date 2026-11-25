import { describe, expect, it } from 'vitest';
import { placeholderCard } from '#lib/index-card.ts';

describe('placeholderCard', () => {
	it('puts the first heading in the band and the rest of the markdown on the lines', () => {
		expect(placeholderCard('---\nnotes: Only for the speaker\n---\n# Talk\n\nIntro\n\n- One point')).toEqual({
			title: 'Talk',
			lines: [
				{ kind: 'text', text: 'Intro' },
				{ kind: 'text', text: '- One point' }
			]
		});
	});

	it('leaves the band empty on a slide with no heading, as the drawn card does', () => {
		expect(placeholderCard('Just some words\n\nMore words')).toEqual({
			title: '',
			lines: [
				{ kind: 'text', text: 'Just some words' },
				{ kind: 'text', text: 'More words' }
			]
		});
	});

	it('leaves a setext heading off the lines, and keeps the same text in a fence above it', () => {
		expect(placeholderCard('Why I kept a diary\n===\n\nBody')).toEqual({
			title: 'Why I kept a diary',
			lines: [{ kind: 'text', text: 'Body' }]
		});
		expect(placeholderCard('```\n# Real\n```\n# Real')).toEqual({
			title: 'Real',
			lines: [
				{ kind: 'text', text: '```' },
				{ kind: 'text', text: '# Real' },
				{ kind: 'text', text: '```' }
			]
		});
	});

	it('writes one line past what a card holds, and no more', () => {
		const { lines } = placeholderCard(Array.from({ length: 50 }, (_, index) => `Line ${index}`).join('\n\n'));
		expect(lines.map(({ text }) => text)).toEqual([
			'Line 0',
			'Line 1',
			'Line 2',
			'Line 3',
			'Line 4',
			'Line 5',
			'Line 6'
		]);
	});
});
