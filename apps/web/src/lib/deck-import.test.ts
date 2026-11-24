import { describe, expect, it } from 'vitest';
import { maxImportBytes } from '#lib/deck-file.ts';
import { importDeckFiles, refusal } from '#lib/deck-import.ts';
import type { NewDeck } from '#lib/decks.ts';

const withoutHandler = (slide: string) => slide.replaceAll(' onerror="x()"', '');

function importer() {
	const created: NewDeck[] = [];
	let loads = 0;
	return {
		created,
		loads: () => loads,
		create: async (deck: NewDeck) => {
			if (deck.title === 'Broken') throw new Error('Disk full');
			created.push(deck);
			return { id: `id-${created.length}` };
		},
		loadCleaner: async () => {
			loads++;
			return withoutHandler;
		}
	};
}

describe('refusal', () => {
	it('refuses a file that is not markdown or is too large', () => {
		expect(refusal({ name: 'photo.png', type: 'image/png', size: 10 })).toBe('not a markdown file');
		expect(refusal({ name: 'big.md', type: '', size: maxImportBytes + 1 })).toBe('over 5 MB');
		expect(refusal({ name: 'talk.md', type: '', size: maxImportBytes })).toBeUndefined();
	});
});

describe('importDeckFiles', () => {
	it('imports each markdown file as a deck with clean slides, and reports the files it leaves out', async () => {
		const files = [
			new File(['# One\n\n---\n\n<img src="a.png" onerror="x()">'], 'Talk.md'),
			new File(['png'], 'photo.png', { type: 'image/png' }),
			new File(['# Two'], 'Broken.md'),
			new File(['+++\ntitle = "Notes"\n+++\n'], 'notes.markdown')
		];
		const target = importer();
		expect(await importDeckFiles(files, target)).toEqual({
			ids: ['id-1', 'id-2'],
			failures: [
				{ name: 'photo.png', reason: 'not a markdown file' },
				{ name: 'Broken.md', reason: 'Disk full' }
			]
		});
		expect(target.created).toEqual([
			{ title: 'Talk', slides: ['# One', '<img src="a.png">'] },
			{ title: 'Notes', slides: [] }
		]);
		expect(target.loads()).toBe(1);
	});

	it('loads no cleaner when no file is markdown', async () => {
		const target = importer();
		await importDeckFiles([new File(['x'], 'a.txt', { type: 'text/plain' })], target);
		expect(target.loads()).toBe(0);
	});
});
