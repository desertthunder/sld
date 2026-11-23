import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const library = fileURLToPath(new URL('../../../../lib/', import.meta.url));
const page = fileURLToPath(new URL('+page.svelte', import.meta.url));

const staticSpecifiers = /(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const dynamicSpecifiers = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(file: string, specifier: string): string | undefined {
	if (specifier.startsWith('#lib/')) return path.resolve(library, specifier.slice('#lib/'.length));
	if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier);
	return undefined;
}

/** Every module `entry` loads with it through static imports, every package they import, and their dynamic imports. */
async function reach(entry: string) {
	const files = new Set<string>();
	const packages = new Set<string>();
	const lazy = new Set<string>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (files.has(file)) continue;
		files.add(file);
		if (!/\.(?:svelte|ts|js)$/.test(file)) continue;
		const source = await readFile(file, 'utf8');
		for (const [, specifier] of source.matchAll(staticSpecifiers)) {
			const resolved = resolveSpecifier(file, specifier!);
			if (resolved) pending.push(resolved);
			else packages.add(specifier!);
		}
		for (const [, specifier] of source.matchAll(dynamicSpecifiers)) {
			lazy.add(resolveSpecifier(file, specifier!) ?? specifier!);
		}
	}
	return { files, packages, lazy };
}

it('loads CodeMirror in its own chunk, only once the deck editor asks for it', async () => {
	const { files, packages, lazy } = await reach(page);
	const markdownEditor = path.resolve(library, 'MarkdownEditor.svelte');
	expect(files).toContain(path.resolve(library, 'DeckEditor.svelte'));
	expect(files).not.toContain(markdownEditor);
	expect([...packages].filter((name) => /codemirror|@lezer\//i.test(name))).toEqual([]);
	expect(lazy).toContain(markdownEditor);
	const editorChunk = await reach(markdownEditor);
	expect([...editorChunk.packages]).toContain('@codemirror/view');
});
