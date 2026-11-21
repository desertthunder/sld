import { createHighlighterCore, type HighlighterCore, type ThemeRegistrationRaw } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';
import { tokenSlots, type TokenKind } from '#lib/color-roles.ts';

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
// A time limit can't hold that steady, so the limit is on length: a longer line shows plain, and would overflow anyway.
const maxLineLength = 1000;

const state: { highlighter?: Promise<HighlighterCore> } = {};
const loading = new Map<string, Promise<void>>();

/** The id Shiki knows a fence's language by, or `undefined` when it has no grammar for it. */
export function knownLanguage(language: string): BundledLanguage | undefined {
	const id = language.toLowerCase();
	return Object.hasOwn(bundledLanguages, id) ? (id as BundledLanguage) : undefined;
}

// The JavaScript regex engine runs every grammar Shiki bundles, so there's no second WebAssembly download.
function highlighter(): Promise<HighlighterCore> {
	state.highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
	return state.highlighter;
}

async function loadLanguage(id: BundledLanguage): Promise<HighlighterCore> {
	const shiki = await highlighter();
	let loaded = loading.get(id);
	if (!loaded) {
		loaded = shiki.loadLanguage(bundledLanguages[id]);
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
	const tokenLines = shiki.codeToTokensBase(code, {
		lang: id,
		theme: theme.name,
		tokenizeTimeLimit: 0,
		tokenizeMaxLineLength: maxLineLength
	});
	return tokenLines.map((line) => {
		const tokens: Token[] = [];
		for (const { content, color: tokenColor = '' } of line) {
			const kind = kindOf.get(tokenColor) ?? 'plain';
			const last = tokens.at(-1);
			if (last?.kind === kind) last.text += content;
			else tokens.push({ kind, text: content });
		}
		return tokens;
	});
}
