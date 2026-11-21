import { bundledLanguages, type BundledLanguage } from 'shiki/langs';

/**
 * The id Shiki knows a fence's language by, or `undefined` when it has no grammar for it. This module holds only the
 * list of languages, so a block in a language Shiki lacks never downloads Shiki itself.
 */
export function knownLanguage(language: string): BundledLanguage | undefined {
	const id = language.toLowerCase();
	return Object.hasOwn(bundledLanguages, id) ? (id as BundledLanguage) : undefined;
}
