import { strToU8, zipSync, type Zippable } from 'fflate';
import { deckFile, deckMarkdown, uniqueFileNames } from '#lib/deck-file.ts';
import type { DeckWithSlides } from '#lib/decks.ts';

/** One `.zip` of every deck's markdown file, named by `uniqueFileNames` and dated when the deck last changed. */
export function decksArchive(decks: readonly DeckWithSlides[]): Uint8Array {
	const names = uniqueFileNames(decks.map(({ title }) => title));
	const files: Zippable = {};
	for (const [index, deck] of decks.entries()) {
		files[names[index]!] = [strToU8(deckMarkdown(deckFile(deck))), { mtime: deck.updatedAt }];
	}
	return zipSync(files);
}

/** The name of the `.zip` of every deck, made on `made`, in local time: `sld decks YYYY-MM-DD.zip`. */
export function archiveName(made: Date): string {
	const month = String(made.getMonth() + 1).padStart(2, '0');
	const day = String(made.getDate()).padStart(2, '0');
	return `sld decks ${made.getFullYear()}-${month}-${day}.zip`;
}
