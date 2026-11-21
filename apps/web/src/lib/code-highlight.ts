import { createHighlighterCore, type HighlighterCore, type ThemeRegistrationRaw } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';
import { tokenSlots, type TokenKind } from '#lib/color-roles.ts';
import { knownLanguage } from '#lib/code-languages.ts';

/** A run of code and the kind of token it is. Each kind's color is the CSS variable `--code-<kind>`. */
export type Token = { kind: TokenKind; text: string };

// TextMate scopes for each kind, after the Base16 styling guide. A more specific scope wins over a shorter one.
const scopes: Record<Exclude<TokenKind, 'plain'>, string[]> = {
	keyword: [
		'keyword',
		'storage',
		'keyword.operator.new',
		'keyword.operator.expression',
		'keyword.operator.word',
		'markup.italic'
	],
	string: ['string', 'markup.inline.raw', 'markup.raw', 'markup.inserted'],
	constant: [
		'constant',
		'constant.numeric',
		'constant.language',
		'support.constant',
		'entity.other.attribute-name',
		'markup.underline.link'
	],
	function: ['entity.name.function', 'support.function', 'meta.function-call.generic', 'markup.heading'],
	type: [
		'entity.name.type',
		'entity.name.class',
		'entity.other.inherited-class',
		'support.type',
		'support.class',
		'storage.type.primitive',
		'markup.bold'
	],
	escape: [
		'constant.character',
		'constant.character.escape',
		'string.regexp',
		'string.regexp keyword',
		'string.regexp constant',
		'punctuation.definition.template-expression',
		'punctuation.section.embedded',
		'punctuation.definition.interpolation',
		'markup.quote'
	],
	tag: ['entity.name.tag', 'support.class.component'],
	comment: ['comment', 'punctuation.definition.comment']
};

// Plain is everything else. These keep operators, and code interpolated into a string, out of the colors around them.
const plainScopes = ['keyword.operator', 'meta.embedded', 'variable'];

const color = (kind: TokenKind) => `var(--code-${kind})`;

const theme: ThemeRegistrationRaw = {
	name: 'base16',
	settings: [
		{ settings: { foreground: color('plain') } },
		{ scope: plainScopes, settings: { foreground: color('plain') } },
		...Object.entries(scopes).map(([kind, scope]) => ({
			scope,
			settings: { foreground: color(kind as TokenKind) }
		}))
	]
};

const kindOf = new Map(Object.keys(tokenSlots).map((kind) => [color(kind as TokenKind), kind as TokenKind]));

// Shiki stops tokenizing a line after 500ms by default, so a busy tab would color a slide differently and cache it.
// The limits are on size instead, and code past them shows plain. This runs on the main thread, and some grammars take
// time cubic in a line's length (bash takes 400ms on 1000 `<`), so the limits sit just past what the stage shows at
// 20px: lines under 200 characters, and the first 100 lines.
const maxLineLength = 200;
const maxLines = 100;

const state: { highlighter?: Promise<HighlighterCore> } = {};
const loading = new Map<string, Promise<void>>();

// The JavaScript regex engine runs every grammar Shiki bundles, so there's no second WebAssembly download.
function highlighter(): Promise<HighlighterCore> {
	state.highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
	return state.highlighter;
}

// A grammar that failed to download is forgotten, so the next block in that language asks for it again.
async function download(shiki: HighlighterCore, id: BundledLanguage): Promise<void> {
	try {
		await shiki.loadLanguage(bundledLanguages[id]);
	} catch (error) {
		loading.delete(id);
		throw error;
	}
}

async function loadLanguage(id: BundledLanguage): Promise<HighlighterCore> {
	const shiki = await highlighter();
	let loaded = loading.get(id);
	if (!loaded) {
		loaded = download(shiki, id);
		loading.set(id, loaded);
	}
	await loaded;
	return shiki;
}

/**
 * `code` split into lines of tokens, with neighbors of one kind joined. Only the grammar for `language`, and those it
 * embeds, are downloaded, on first use. Returns `undefined` when there is no grammar for `language`.
 */
export async function highlightCode(code: string, language: string): Promise<Token[][] | undefined> {
	const id = knownLanguage(language);
	if (!id) return undefined;
	const shiki = await loadLanguage(id);
	const lines = code.split('\n');
	const tokenLines = shiki.codeToTokensBase(lines.slice(0, maxLines).join('\n'), {
		lang: id,
		theme: theme.name,
		tokenizeTimeLimit: 0,
		tokenizeMaxLineLength: maxLineLength
	});
	const highlighted = tokenLines.map((line) => {
		const tokens: Token[] = [];
		for (const { content, color: tokenColor = '' } of line) {
			const kind = kindOf.get(tokenColor) ?? 'plain';
			const last = tokens.at(-1);
			if (last?.kind === kind) last.text += content;
			else tokens.push({ kind, text: content });
		}
		return tokens;
	});
	const rest = lines.slice(maxLines).map((line): Token[] => (line === '' ? [] : [{ kind: 'plain', text: line }]));
	return [...highlighted, ...rest];
}
