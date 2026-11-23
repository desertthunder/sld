import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const library = fileURLToPath(new URL('../../../../../lib/', import.meta.url));
const page = fileURLToPath(new URL('+page.svelte', import.meta.url));

// Static and dynamic imports alike: a dynamic one still loads its chunk while presenting.
const specifiers = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

/** Every module `entry` reaches through the app's own imports, and every package or virtual module they import. */
async function reach(entry: string): Promise<{ files: Set<string>; packages: Set<string> }> {
	const files = new Set<string>();
	const packages = new Set<string>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (files.has(file)) continue;
		files.add(file);
		if (!/\.(?:svelte|ts|js)$/.test(file)) continue;
		const source = await readFile(file, 'utf8');
		const imports = source.matchAll(specifiers);
		for (const [, specifier] of imports) {
			if (specifier.startsWith('#lib/')) pending.push(path.resolve(library, specifier.slice('#lib/'.length)));
			else if (specifier.startsWith('.')) pending.push(path.resolve(path.dirname(file), specifier));
			else packages.add(specifier);
		}
	}
	return { files, packages };
}

it('presents without loading the editor or CodeMirror', async () => {
	const { files, packages } = await reach(page);
	expect(files).toContain(path.resolve(library, 'Presenter.svelte'));
	expect([...packages].filter((name) => /codemirror|@lezer\//i.test(name))).toEqual([]);
	expect([...files].filter((file) => /editor/i.test(file))).toEqual([]);
});
