import { describe, expect, it } from 'vitest';
import { deckFrontmatter, joinDeck, slideFrontmatter, slideParts, splitDeck } from '#lib/deck-markdown.ts';

const lines = (...rows: string[]) => rows.join('\n');

/**
 * The lines that carry text, leaving out blank lines and every `---` except one right under plain paragraph text
 * outside a list or blockquote, which is a setext underline or a YAML block's closing line and so must survive.
 */
function textLines(markdown: string): string[] {
	const kept: string[] = [];
	let isParagraph = false;
	let isInContainer = false;
	for (const line of markdown.replaceAll(/\r\n?/g, '\n').split('\n')) {
		if (line.trim() === '') {
			isParagraph = false;
			isInContainer = false;
		} else if (line === '---') {
			if (isParagraph && !isInContainer) kept.push(line);
			isParagraph = false;
			isInContainer = false;
		} else {
			kept.push(line);
			if (/^(?:- |> |1\. )/.test(line)) isInContainer = true;
			isParagraph = /^[A-Za-z|]/.test(line);
		}
	}
	return kept;
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

	it('splits on --- right after a closing fence or an ATX heading, which take no setext underline', () => {
		const code = lines('```js', 'x', '```');
		expect(splitDeck(lines(code, '---', '# Two')).slides).toEqual([code, '# Two']);
		expect(splitDeck(lines('# One', '---', '# Two')).slides).toEqual(['# One', '# Two']);
		expect(splitDeck(lines('## One ##', '---', 'layout: center', '---', 'Two')).slides).toEqual([
			'## One ##',
			'---\nlayout: center\n---\nTwo'
		]);
		expect(splitDeck(lines('#hashtag', '---', 'Text.')).slides).toEqual(['#hashtag\n---\nText.']);
	});

	it('splits on --- right after a list item, blockquote, thematic break or setext heading', () => {
		expect(splitDeck(lines('- item', '---', '# Two')).slides).toEqual(['- item', '# Two']);
		expect(splitDeck(lines('1. item', 'lazy text', '---', '# Two')).slides).toEqual([
			'1. item\nlazy text',
			'# Two'
		]);
		expect(splitDeck(lines('> quote', '---', '# Two')).slides).toEqual(['> quote', '# Two']);
		expect(splitDeck(lines('***', '---', '# Two')).slides).toEqual(['***', '# Two']);
		expect(splitDeck(lines('Title', '=====', '---', '# Two')).slides).toEqual(['Title\n=====', '# Two']);
		expect(splitDeck(lines('Title', '---', '---', '# Two')).slides).toEqual(['Title\n---', '# Two']);
	});

	it('reads --- under paragraph text that no list can interrupt as a setext underline', () => {
		for (const slide of [lines('Text', '2. not a list', '---'), lines('- a', '', 'b', '---')]) {
			expect(splitDeck(slide).slides).toEqual([slide]);
		}
	});

	it('leaves a table separator row alone', () => {
		const table = lines('| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'a | b', '--- | ---', '1 | 2');
		expect(splitDeck(table).slides).toEqual([table]);
	});

	it('splits only on an exact ---, not an indented, padded or longer one', () => {
		const slide = lines('# One', '', '  ---', '', '--- ', '', '----', '', '***');
		expect(splitDeck(slide).slides).toEqual([slide]);
	});

	it('ignores a byte order mark before the deck frontmatter', () => {
		expect(splitDeck('\u{FEFF}---\ntitle: Talk\n---\n\n# One\n')).toEqual({
			frontmatter: { format: 'yaml', raw: 'title: Talk', data: { title: 'Talk' }, title: 'Talk' },
			slides: ['# One']
		});
	});

	it('reads CRLF and CR line endings as LF', () => {
		expect(splitDeck('---\r\ntitle: Talk\r\n---\r\n\r\n# One\r\n\r\n---\r\n\r\n# Two\r\n')).toEqual({
			frontmatter: { format: 'yaml', raw: 'title: Talk', data: { title: 'Talk' }, title: 'Talk' },
			slides: ['# One', '# Two']
		});
		expect(splitDeck('+++\r\ntitle = "Talk"\r\n+++\r\n\r\n# One\r\n').frontmatter?.raw).toBe('title = "Talk"');
		expect(splitDeck('# One\r\r---\r\r# Two\r').slides).toEqual(['# One', '# Two']);
	});

	it('takes a YAML block at the top as the deck frontmatter', () => {
		const yaml = lines('title: My talk', 'scheme: gruvbox-dark-medium', 'aspect: 16:9');
		expect(splitDeck(lines('---', yaml, '---', '', '# One', ''))).toEqual({
			frontmatter: {
				format: 'yaml',
				raw: yaml,
				data: { title: 'My talk', scheme: 'gruvbox-dark-medium', aspect: '16:9' },
				title: 'My talk',
				scheme: 'gruvbox-dark-medium',
				aspect: '16:9'
			},
			slides: ['# One']
		});
	});

	it('reads a deck with only frontmatter as no slides', () => {
		expect(splitDeck(lines('---', 'title: Empty', '---', '')).slides).toEqual([]);
		expect(splitDeck(lines('+++', 'title = "Empty"', '+++', '')).slides).toEqual([]);
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
		expect(splitDeck(lines('---', 'title: Talk', '---', '', first)).slides).toEqual([first]);
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

	it('reads a --- after a blank line as a separator, never the close of a YAML block', () => {
		expect(
			splitDeck(lines('# Talk', '', '---', 'Speaker: Jane', 'Date: Nov 21', '', '---', '', '# Agenda')).slides
		).toEqual(['# Talk', 'Speaker: Jane\nDate: Nov 21', '# Agenda']);
		expect(splitDeck(lines('---', 'title: Talk', '', '---', '', '# One'))).toEqual({
			frontmatter: undefined,
			slides: ['title: Talk', '# One']
		});
	});

	it('reads --- right after a separator as another separator', () => {
		expect(splitDeck(lines('# One', '', '---', '---', '', '# Two')).slides).toEqual(['# One', '', '# Two']);
	});

	it('takes a TOML block at the top as the deck frontmatter, keeping unknown keys', () => {
		const toml = lines('title = "My talk"', 'scheme = "ocean"', 'aspect = "16:9"', '', '[speaker]', 'name = "Ada"');
		expect(splitDeck(lines('+++', toml, '+++', '', '# One', ''))).toEqual({
			frontmatter: {
				format: 'toml',
				raw: toml,
				data: { title: 'My talk', scheme: 'ocean', aspect: '16:9', speaker: { name: 'Ada' } },
				title: 'My talk',
				scheme: 'ocean',
				aspect: '16:9'
			},
			slides: ['# One']
		});
	});

	it('types a deck field only when it holds a string, and keeps every value in data', () => {
		const { frontmatter } = splitDeck(lines('---', 'title: 2024', 'scheme: ocean', 'extra: [1, 2]', '---', ''));
		expect(frontmatter).toEqual({
			format: 'yaml',
			raw: 'title: 2024\nscheme: ocean\nextra: [1, 2]',
			data: { title: 2024, scheme: 'ocean', extra: [1, 2] },
			scheme: 'ocean'
		});
	});

	it('keeps a malformed block as slide text, line for line', () => {
		const toml = lines('+++', 'title = "unclosed', '+++', '', '# One');
		expect(splitDeck(toml)).toEqual({ frontmatter: undefined, slides: [toml] });
		const prose = lines('+++', 'Just a line.', '+++', '', '# One');
		expect(splitDeck(prose)).toEqual({ frontmatter: undefined, slides: [prose] });
		const yaml = lines('---', 'Note: a: b', '---', '', '# One');
		expect(splitDeck(yaml)).toEqual({ frontmatter: undefined, slides: ['Note: a: b\n---\n\n# One'] });
		const slide = lines('+++', 'layout = center', '+++', '', '# Two');
		expect(splitDeck(lines('# One', '', '---', slide)).slides).toEqual(['# One', slide]);
	});

	it('keeps a YAML block that parses but cannot be resolved as slide text', () => {
		const alias = lines('---', 'key: *missing', '---', '', '# One');
		expect(splitDeck(alias)).toEqual({ frontmatter: undefined, slides: ['key: *missing\n---\n\n# One'] });
		expect(slideFrontmatter(alias)).toBeUndefined();
		const anchors = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
		for (const name of 'bcdefghi') {
			const previous = String.fromCodePoint(name.codePointAt(0)! - 1);
			anchors.push(`${name}: &${name} [${Array.from({ length: 10 }, () => `*${previous}`).join(', ')}]`);
		}
		const bomb = lines('# One', '', '---', ...anchors, '---', '', '# Two');
		expect(splitDeck(bomb).slides).toEqual(['# One', lines(...anchors, '---', '', '# Two')]);
	});

	it('reads a YAML block that opens with a comment or heading as slide text', () => {
		expect(splitDeck(lines('# One', '', '---', '# Two', 'Note: text', '---', '', 'More.')).slides).toEqual([
			'# One',
			'# Two\nNote: text\n---\n\nMore.'
		]);
	});

	it('keeps a TOML block on the first line of a slide in that slide', () => {
		const second = lines('+++', 'layout = "center"', 'class = ["big"]', '+++', '', '# Two');
		expect(splitDeck(lines('# One', '', '---', second, '', '---', '', '# Three')).slides).toEqual([
			'# One',
			second,
			'# Three'
		]);
		expect(splitDeck(lines('# One', '', '---', '', '', second)).slides).toEqual(['# One', second]);
	});

	it('reads a --- inside a slide TOML block as part of the block, not a separator', () => {
		const second = lines('+++', 'notes = """', '', '---', '', '"""', '+++', '', '# Two');
		expect(splitDeck(lines('# One', '', '---', second)).slides).toEqual(['# One', second]);
	});

	it('reads a --- right after a TOML block as a separator', () => {
		expect(
			splitDeck(lines('# One', '', '---', '+++', 'layout = "blank"', '+++', '---', '', '# Three')).slides
		).toEqual(['# One', '+++\nlayout = "blank"\n+++', '# Three']);
	});

	it('mixes YAML and TOML frontmatter across the deck and its slides', () => {
		const yamlSlide = lines('---', 'layout: center', '---', '', '# Two');
		const tomlSlide = lines('+++', 'layout = "cover"', '+++', '', '# Three');
		const deck = splitDeck(lines('+++', 'title = "Talk"', '+++', '', '# One', '', yamlSlide, '', '---', tomlSlide));
		expect(deck.frontmatter?.format).toBe('toml');
		expect(deck.slides).toEqual(['# One', yamlSlide, tomlSlide]);
	});

	it('ignores +++ inside fenced code', () => {
		const slide = lines('```toml', '+++', 'title = "x"', '+++', '```');
		expect(splitDeck(lines('# One', '', '---', slide)).slides).toEqual(['# One', slide]);
		const top = lines('~~~', '+++', 'a = 1', '+++', '~~~');
		expect(splitDeck(top)).toEqual({ frontmatter: undefined, slides: [top] });
	});

	it('reads a +++ block in the middle of a slide as slide text', () => {
		const slide = lines('# One', '', '+++', 'a = 1', '+++', '', 'Text.');
		expect(splitDeck(slide).slides).toEqual([slide]);
		expect(slideFrontmatter(slide)).toBeUndefined();
	});

	it('reads +++ lines that hold no TOML block as slide text', () => {
		const slide = lines('+++', '', 'a = 1', '+++', '', '+++', '# heading', '+++', '', '++++', 'a = 1', '++++');
		expect(splitDeck(slide)).toEqual({ frontmatter: undefined, slides: [slide] });
	});
});

describe('slideFrontmatter', () => {
	it('parses the YAML or TOML block a slide opens with', () => {
		expect(slideFrontmatter(lines('---', 'layout: center', '---', '', '# Two'))).toEqual({
			format: 'yaml',
			raw: 'layout: center',
			data: { layout: 'center' }
		});
		expect(slideFrontmatter(lines('+++', 'layout = "center"', 'step = 2', '+++', '', '# Two'))).toEqual({
			format: 'toml',
			raw: 'layout = "center"\nstep = 2',
			data: { layout: 'center', step: 2 }
		});
	});

	it('finds nothing in a slide with no frontmatter or a malformed block', () => {
		expect(slideFrontmatter('# Two')).toBeUndefined();
		expect(slideFrontmatter('')).toBeUndefined();
		expect(slideFrontmatter(lines('+++', 'layout =', '+++'))).toBeUndefined();
	});
});

describe('slideParts', () => {
	it('splits the frontmatter block from the markdown after it', () => {
		expect(slideParts(lines('+++', 'layout = "center"', '+++', '', '# Two'))).toEqual({
			frontmatter: { format: 'toml', raw: 'layout = "center"', data: { layout: 'center' } },
			body: lines('', '# Two')
		});
		expect(slideParts(lines('---', 'layout: center', '---', '# Two'))).toEqual({
			frontmatter: { format: 'yaml', raw: 'layout: center', data: { layout: 'center' } },
			body: '# Two'
		});
	});

	it('keeps a slide with no frontmatter or a malformed block whole', () => {
		const malformed = lines('---', 'layout: [', '---', '# Two');
		expect(slideParts(malformed)).toEqual({ frontmatter: undefined, body: malformed });
		expect(slideParts('# Two')).toEqual({ frontmatter: undefined, body: '# Two' });
	});
});

describe('deckFrontmatter', () => {
	it('writes fields as TOML between +++ lines', () => {
		const frontmatter = deckFrontmatter({
			title: 'Talk',
			scheme: 'ocean',
			aspect: '16:9',
			speaker: { name: 'Ada' }
		});
		const raw = lines('title = "Talk"', 'scheme = "ocean"', 'aspect = "16:9"', '', '[speaker]', 'name = "Ada"');
		expect(frontmatter).toEqual({
			format: 'toml',
			raw,
			data: { title: 'Talk', scheme: 'ocean', aspect: '16:9', speaker: { name: 'Ada' } },
			title: 'Talk',
			scheme: 'ocean',
			aspect: '16:9'
		});
		expect(joinDeck({ frontmatter, slides: ['# One'] })).toBe(lines('+++', raw, '+++', '', '# One', ''));
	});

	it('gives no frontmatter for no fields, leaving out undefined and null', () => {
		expect(deckFrontmatter({})).toBeUndefined();
		// eslint-disable-next-line unicorn/no-null -- fields copied from parsed YAML can hold null, which TOML can't write
		expect(deckFrontmatter({ title: undefined, scheme: null })).toBeUndefined();
	});

	it('leaves out null values nested in tables and arrays, as parsed YAML can hold them', () => {
		const { frontmatter } = splitDeck(
			lines('---', 'title: Talk', 'tags: [a, ~]', 'speaker:', '  name:', '---', '')
		);
		expect(deckFrontmatter(frontmatter!.data)?.data).toEqual({ title: 'Talk', tags: ['a'], speaker: {} });
	});

	it('writes frontmatter that splitDeck reads back, even when a value holds delimiter lines', () => {
		const frontmatter = deckFrontmatter({ title: 'a\n+++\n---\nb', 'odd "key"': 1 });
		const deck = { frontmatter, slides: ['# One'] };
		expect(splitDeck(joinDeck(deck))).toEqual(deck);
	});
});

describe('joinDeck', () => {
	it('writes an empty deck as an empty document', () => {
		expect(joinDeck({ frontmatter: undefined, slides: [] })).toBe('');
	});

	it('puts a separator before the first slide when its frontmatter would read as the deck', () => {
		const first = lines('---', 'layout: cover', '---', '', '# One');
		expect(joinDeck({ frontmatter: undefined, slides: [first] })).toBe(lines('---', '', first, ''));
		const toml = lines('+++', 'layout = "cover"', '+++', '', '# One');
		expect(joinDeck({ frontmatter: undefined, slides: [toml] })).toBe(lines('---', toml, ''));
	});

	it('writes each frontmatter block in the format it came in', () => {
		const markdown = lines('---', 'title: Talk', '---', '', '# One', '', '---', '+++', 'step = 1', '+++', '');
		expect(joinDeck(splitDeck(markdown))).toBe(markdown);
		const toml = { format: 'toml', raw: 'title = "Talk"' } as const;
		expect(joinDeck({ frontmatter: toml, slides: [] })).toBe(lines('+++', 'title = "Talk"', '+++', ''));
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
		'setext heading ending a slide': lines('# One', '', 'Heading', '---', '', '---', '', 'Two', ''),
		'list and blockquote before separators': lines('- item', '', '---', '', '> quote', '', '---', '', 'Two', ''),
		'setext heading and table': lines('Heading', '---', '', '| a |', '| --- |', '', '---', '', 'Two', ''),
		'heading and fence before a separator': lines(
			'# One',
			'',
			'---',
			'',
			'```',
			'x',
			'```',
			'',
			'---',
			'',
			'# Three',
			''
		),
		'TOML deck frontmatter': lines('+++', 'title = "Talk"', 'aspect = "16:9"', '+++', '', '# One', ''),
		'TOML deck frontmatter only': lines('+++', 'title = "Talk"', '+++', ''),
		'TOML slide frontmatter': lines('# One', '', '---', '+++', 'layout = "center"', '+++', '', '# Two', ''),
		'TOML frontmatter on the first slide': lines('---', '+++', 'layout = "cover"', '+++', '', '# One', ''),
		'TOML deck and first slide frontmatter': lines(
			'+++',
			'title = "Talk"',
			'+++',
			'',
			'+++',
			'layout = "cover"',
			'+++',
			'',
			'# One',
			''
		),
		'mixed YAML and TOML': lines(
			'+++',
			'title = "Talk"',
			'+++',
			'',
			'---',
			'layout: cover',
			'---',
			'',
			'# One',
			'',
			'---',
			'+++',
			'layout = "center"',
			'+++',
			'',
			'# Two',
			''
		),
		'fenced +++ and stray +++': lines(
			'```toml',
			'+++',
			'a = 1',
			'+++',
			'```',
			'',
			'---',
			'',
			'+++',
			'Text.',
			'+++',
			''
		)
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
			'#tag',
			'Some text.',
			'key: value',
			'Note: text',
			'  nested: 1',
			'- item',
			'1. item',
			'> quote',
			'===',
			'-',
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
			'| --- | --- |',
			'+++',
			'key = "value"',
			'[table]',
			'"""',
			'++++',
			'title = "unclosed'
		].map((line) => [line]),
		['', '---', ''],
		['', '---', ''],
		['', '---', 'layout: center', '---', ''],
		['---', 'title: Talk', '---'],
		['```', '---', '```'],
		['```', 'x', '```', '---', 'layout: center', '---'],
		['+++', 'title = "Talk"', '+++'],
		['', '---', '+++', 'layout = "center"', '+++', ''],
		['+++', 'notes = """', '', '---', '', '"""', '+++'],
		['```toml', '+++', 'a = 1', '+++', '```'],
		['+++', 'Note: not TOML', '+++']
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
