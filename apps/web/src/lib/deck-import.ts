import { deckFromFile, isMarkdownFile, maxImportBytes } from '#lib/deck-file.ts';
import type { NewDeck } from '#lib/decks.ts';
import { errorText } from '#lib/error-text.ts';

/** A file that didn't import, by its name, and why, as the library says it. */
export type ImportFailure = { name: string; reason: string };

/** What importing needs: a way to store a deck, and a way to load the check that makes a slide's raw HTML safe. */
export type Importer = {
	create: (deck: NewDeck) => Promise<{ id: string }>;
	loadCleaner: () => Promise<(slide: string) => string>;
};

/** Why the library refuses a file before reading it, or undefined when it takes it. */
export function refusal(file: Pick<File, 'name' | 'type' | 'size'>): string | undefined {
	if (!isMarkdownFile(file)) return 'not a markdown file';
	if (file.size > maxImportBytes) return `over ${maxImportBytes / 1024 / 1024} MB`;
	return undefined;
}

/**
 * Imports each markdown file as a new deck, in order, with every slide's raw HTML made safe before it is stored. A file
 * the library refuses, or one that fails to read or store, is left out and reported, and the rest still import.
 */
export async function importDeckFiles(
	files: readonly File[],
	{ create, loadCleaner }: Importer
): Promise<{ ids: string[]; failures: ImportFailure[] }> {
	const ids: string[] = [];
	const failures: ImportFailure[] = [];
	let clean: ((slide: string) => string) | undefined;
	for (const file of files) {
		const reason = refusal(file);
		if (reason) {
			failures.push({ name: file.name, reason });
			continue;
		}
		try {
			clean ??= await loadCleaner();
			const cleaner = clean;
			const deck = deckFromFile(file.name, await file.text());
			const { id } = await create({ ...deck, slides: deck.slides.map((slide) => cleaner(slide)) });
			ids.push(id);
		} catch (error) {
			failures.push({ name: file.name, reason: errorText(error) });
		}
	}
	return { ids, failures };
}
