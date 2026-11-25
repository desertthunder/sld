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
});
