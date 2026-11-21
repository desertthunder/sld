/**
 * Compiles tinted-theming's Base16 schemes at a pinned commit into `src/lib/schemes/base16.json`, and copies their
 * license beside it. With `--check`, writes nothing and fails when either committed file differs.
 * Run as `pnpm --filter @sld/web schemes [--check]`; it needs `git` and access to GitHub.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileSchemes, serializeSchemes } from '#lib/scheme-compiler.ts';

const schemesRepository = 'https://github.com/tinted-theming/schemes';
const schemesCommit = '1bd5ad4c2c554c9c8e288b56deab2364ac8dada0';

const outputFolder = path.join(import.meta.dirname, 'lib', 'schemes');

function readUpstream(): { json: string; license: string } {
	const folder = mkdtempSync(path.join(tmpdir(), 'sld-schemes-'));
	try {
		const git = (...arguments_: string[]) => execFileSync('git', arguments_, { cwd: folder, stdio: 'inherit' });
		git('init', '--quiet');
		git('fetch', '--quiet', '--depth', '1', `${schemesRepository}.git`, schemesCommit);
		git('checkout', '--quiet', 'FETCH_HEAD');
		const base16 = path.join(folder, 'base16');
		const files = readdirSync(base16).map((name) => ({
			name,
			text: readFileSync(path.join(base16, name), 'utf8')
		}));
		return {
			json: serializeSchemes(compileSchemes(files, schemesRepository, schemesCommit)),
			license: readFileSync(path.join(folder, 'LICENSE'), 'utf8')
		};
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

function readCommitted(file: string): string | undefined {
	try {
		return readFileSync(file, 'utf8');
	} catch {
		return undefined;
	}
}

const upstream = readUpstream();
const outputs = [
	{ file: path.join(outputFolder, 'base16.json'), text: upstream.json },
	{ file: path.join(outputFolder, 'LICENSE'), text: upstream.license }
];

if (process.argv.includes('--check')) {
	const stale = outputs.filter(({ file, text }) => readCommitted(file) !== text);
	for (const { file } of stale) {
		console.error(`${path.relative(process.cwd(), file)} is stale. Run \`pnpm --filter @sld/web schemes\`.`);
	}
	if (stale.length > 0) process.exitCode = 1;
	else console.log('The compiled schemes match the pinned commit.');
} else {
	mkdirSync(outputFolder, { recursive: true });
	for (const { file, text } of outputs) writeFileSync(file, text);
	console.log(`Wrote ${outputs.map(({ file }) => path.relative(process.cwd(), file)).join(' and ')}.`);
}
