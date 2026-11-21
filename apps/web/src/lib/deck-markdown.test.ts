import { describe, expect, it } from 'vitest';
import { joinDeck, splitDeck } from '#lib/deck-markdown.ts';

const lines = (...rows: string[]) => rows.join('\n');

/** The lines that carry text, leaving out blank lines and separators. */
function textLines(markdown: string): string[] {
	return markdown
		.replaceAll(/\r\n?/g, '\n')
		.split('\n')
		.filter((line) => line.trim() !== '' && line !== '---');
}

describe('splitDeck', () => {
	it('splits on a line that is exactly ---', () => {
		expect(splitDeck(lines('# One', '', '---', '', '# Two', ''))).toEqual({
			frontmatter: undefined,
			slides: ['# One', '# Two']
		});
	});

	it('reads a document with no separator as one slide', () => {
		expect(splitDeck(lines('# Only', '', 'Text.')).slides).toEqual(['# Only\n\nText.']);
	});

	it('reads an empty or blank document as no slides', () => {
		expect(splitDeck('')).toEqual({ frontmatter: undefined, slides: [] });
		expect(splitDeck('\n  \n\n')).toEqual({ frontmatter: undefined, slides: [] });
	});

	it('drops empty slides at either end and keeps those in the middle', () => {
		expect(splitDeck(lines('---', '', '# One', '', '---', '', '---', '', '# Two', '', '---', '')).slides).toEqual([
			'# One',
			'',
			'# Two'
		]);
	});

	it('ignores --- inside fenced code', () => {
		const slide = lines('```yaml', '---', 'a: 1', '', '---', '```');
		expect(splitDeck(lines(slide, '', '---', '', '# Two')).slides).toEqual([slide, '# Two']);
	});

	it('closes a fence only with the same marker at least as long', () => {
		const tildes = lines('~~~', '```', '', '---', '~~~');
		const long = lines('````md', '```', '', '---', '```', '````');
		expect(splitDeck(lines(tildes, '', '---', '', long, '', '---', '', 'end')).slides).toEqual([
			tildes,
			long,
			'end'
		]);
	});

	it('lets an unclosed fence run to the end of the document', () => {
		const rest = lines('```', 'code', '', '---', '', '# Not a slide');
		expect(splitDeck(lines('# One', '', '---', '', rest)).slides).toEqual(['# One', rest]);
	});

	it('reads --- right under text as a setext heading, not a separator', () => {
		expect(splitDeck(lines('Heading', '---', '', 'Text.')).slides).toEqual(['Heading\n---\n\nText.']);
	});

	it('leaves a table separator row alone', () => {
		const table = lines('| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'a | b', '--- | ---', '1 | 2');
		expect(splitDeck(table).slides).toEqual([table]);
	});

	it('splits only on an exact ---, not an indented, padded or longer one', () => {
		const slide = lines('# One', '', '  ---', '', '--- ', '', '----', '', '***');
		expect(splitDeck(slide).slides).toEqual([slide]);
	});

	it('reads CRLF and CR line endings as LF', () => {
		expect(splitDeck('---\r\ntitle: Talk\r\n---\r\n\r\n# One\r\n\r\n---\r\n\r\n# Two\r\n')).toEqual({
			frontmatter: 'title: Talk',
			slides: ['# One', '# Two']
		});
		expect(splitDeck('# One\r\r---\r\r# Two\r').slides).toEqual(['# One', '# Two']);
	});

	it('takes a YAML block at the top as the deck frontmatter', () => {
		const yaml = lines('title: My talk', 'scheme: gruvbox-dark-medium', 'aspect: 16:9');
		expect(splitDeck(lines('---', yaml, '---', '', '# One', ''))).toEqual({ frontmatter: yaml, slides: ['# One'] });
	});

	it('reads a deck with only frontmatter as no slides', () => {
		expect(splitDeck(lines('---', 'title: Empty', '---', ''))).toEqual({ frontmatter: 'title: Empty', slides: [] });
	});

	it('reads a --- at the top that opens no YAML block as a separator', () => {
		expect(splitDeck(lines('---', '', '# One', '', '---', '# Two')).slides).toEqual(['# One', '# Two']);
		expect(splitDeck(lines('---', 'Note: not YAML', '', 'A paragraph.')).slides).toEqual([
			'Note: not YAML\n\nA paragraph.'
		]);
	});

	it('keeps a YAML block after a separator in that slide', () => {
		const second = lines('---', 'layout: center', 'class:', '  - big', '# a comment', '---', '', '# Two');
		expect(splitDeck(lines('# One', '', second, '', '---', '', '# Three')).slides).toEqual([
			'# One',
			second,
			'# Three'
		]);
	});

	it('gives the first slide frontmatter only after a separator, since the top block is the deck', () => {
		const first = lines('---', 'layout: cover', '---', '', '# One');
		expect(splitDeck(lines('---', 'title: Talk', '---', '', first))).toEqual({
			frontmatter: 'title: Talk',
			slides: [first]
		});
		expect(splitDeck(lines('---', '', first))).toEqual({ frontmatter: undefined, slides: [first] });
	});

	it('reads a block after a separator that is not YAML-shaped as slide text', () => {
		expect(splitDeck(lines('# One', '', '---', 'Note: text', '', 'More text.', '---', '', '# Two')).slides).toEqual(
			['# One', 'Note: text\n\nMore text.\n---\n\n# Two']
		);
	});

	it('reads key: value lines between a separator and --- as slide frontmatter', () => {
		expect(splitDeck(lines('# One', '', '---', 'Note: one', '---', '', 'Text.')).slides).toEqual([
			'# One',
			'---\nNote: one\n---\n\nText.'
		]);
	});

	it('reads --- right after a separator as another separator', () => {
		expect(splitDeck(lines('# One', '', '---', '---', '', '# Two')).slides).toEqual(['# One', '', '# Two']);
	});
});

describe('joinDeck', () => {
	it('writes an empty deck as an empty document', () => {
		expect(joinDeck({ frontmatter: undefined, slides: [] })).toBe('');
	});

	it('puts a separator before the first slide when its frontmatter would read as the deck', () => {
		const first = lines('---', 'layout: cover', '---', '', '# One');
		expect(joinDeck({ frontmatter: undefined, slides: [first] })).toBe(lines('---', '', first, ''));
	});

	const normalized: Record<string, string> = {
		empty: '',
		'one slide': lines('# Only', '', 'Text.', ''),
		'two slides': lines('# One', '', '---', '', '# Two', ''),
		'an empty middle slide': lines('# One', '', '---', '', '---', '', '# Two', ''),
		'deck frontmatter': lines('---', 'title: Talk', 'scheme: ocean', 'aspect: 16:9', '---', '', '# One', ''),
		'deck frontmatter only': lines('---', 'title: Talk', '---', ''),
		'slide frontmatter': lines('# One', '', '---', 'layout: center', '---', '', '# Two', ''),
		'only frontmatter on a slide': lines('# One', '', '---', 'layout: blank', '---', ''),
		'frontmatter on the first slide': lines('---', '', '---', 'layout: cover', '---', '', '# One', ''),
		'deck and first slide frontmatter': lines(
			'---',
			'title: Talk',
			'---',
			'',
			'---',
			'layout: cover',
			'---',
			'',
			'# One',
			''
		),
		'fenced ---': lines('```md', '---', '```', '', '---', '', '~~~', '', '---', '~~~', ''),
		'setext heading and table': lines('Heading', '---', '', '| a |', '| --- |', '', '---', '', 'Two', '')
	};

	for (const [name, markdown] of Object.entries(normalized)) {
		it(`reverses splitDeck for normalized input: ${name}`, () => {
			expect(joinDeck(splitDeck(markdown))).toBe(markdown);
		});
	}
});

describe('splitDeck and joinDeck on generated documents', () => {
	const pieces = [
		...[
			'---',
			'',
			'  ',
			'# Title',
			'Some text.',
			'key: value',
			'Note: text',
			'  nested: 1',
			'- item',
			'# comment',
			'```',
			'```js',
			'````',
			'~~~',
			'  ---',
			'--- ',
			'----',
			'***',
			'| a | b |',
			'| --- | --- |'
		].map((line) => [line]),
		['', '---', ''],
		['', '---', ''],
		['', '---', 'layout: center', '---', ''],
		['---', 'title: Talk', '---'],
		['```', '---', '```']
	];
	let seed = 9;
	const random = () => {
		seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
		return seed / 4_294_967_296;
	};
	const pick = () => pieces[Math.floor(random() * pieces.length)];
	const documents = Array.from({ length: 3000 }, () => {
		const length = Math.floor(random() * 12);
		return Array.from({ length }, pick)
			.flat()
			.join(random() < 0.2 ? '\r\n' : '\n');
	});

	it('normalizes in one step and reads the normalized document the same way', () => {
		for (const markdown of documents) {
			const deck = splitDeck(markdown);
			const normal = joinDeck(deck);
			expect(splitDeck(normal), JSON.stringify(markdown)).toEqual(deck);
			expect(joinDeck(splitDeck(normal)), JSON.stringify(markdown)).toBe(normal);
		}
	});

	it('keeps every line of text in order', () => {
		for (const markdown of documents) {
			const normal = joinDeck(splitDeck(markdown));
			expect(textLines(normal), JSON.stringify(markdown)).toEqual(textLines(markdown));
		}
	});
});
