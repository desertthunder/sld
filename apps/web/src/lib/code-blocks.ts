import { defineHastPlugin, type HastNode, type HastPluginDefinition } from 'satteri';
import type { Token } from '#lib/code-highlight.ts';
import { isHighlighted, lineHighlights } from '#lib/line-highlights.ts';

type Element = Extract<HastNode, { type: 'element' }>;
type Text = Extract<HastNode, { type: 'text' }>;

/** What a deck sets for its code blocks. */
export type CodeBlockOptions = { lineNumbers: boolean };

const languagePrefix = 'language-';

/**
 * A fence's language and the rest of its info string. A brace group written against the language, as in `ts{2}`,
 * belongs to the rest.
 */
function fenceOf(code: Element): { language: string | undefined; meta: string | undefined } {
	const classes = code.properties.className;
	const name = Array.isArray(classes)
		? classes.find((value) => typeof value === 'string' && value.startsWith(languagePrefix))
		: undefined;
	const data = (code.data as { meta?: unknown } | undefined)?.meta;
	const meta = typeof data === 'string' ? data : undefined;
	if (typeof name !== 'string') return { language: undefined, meta };
	const [, language, braces] = /^([^{]*)(\{.*)?$/.exec(name.slice(languagePrefix.length))!;
	if (braces === undefined) return { language, meta };
	return { language: language || undefined, meta: meta === undefined ? braces : `${braces} ${meta}` };
}

function text(value: string): Text {
	return { type: 'text', value };
}

function span(className: string[], children: HastNode[]): Element {
	return { type: 'element', tagName: 'span', properties: { className }, children: children as Element['children'] };
}

function plainLines(code: string): Token[][] {
	return code.split('\n').map((line) => (line === '' ? [] : [{ kind: 'plain', text: line }]));
}

/**
 * A fenced code block as the stage shows it: one `span.line` per line, each token a `span.code-<kind>` whose color
 * comes from the scheme, so a new scheme recolors it without highlighting again. Shiki and a language's grammar are
 * downloaded only when a block names a language it knows; any other block, or one whose grammar fails to download,
 * shows as plain text. Lines are dimmed only when the fence highlights a line the block has. A labeled block's first line
 * carries the label too, so its code stops short of the label.
 */
export async function codeBlockTree(
	code: string,
	language: string | undefined,
	meta: string | undefined,
	{ lineNumbers }: CodeBlockOptions
): Promise<Element> {
	const source = code.endsWith('\n') ? code.slice(0, -1) : code;
	let lines: Token[][] | undefined;
	let label = language;
	if (language) {
		try {
			const { knownLanguage, languageLabel } = await import('#lib/code-languages.ts');
			label = languageLabel(language);
			const id = knownLanguage(language);
			if (id) {
				const { highlightCode } = await import('#lib/code-highlight.ts');
				lines = await highlightCode(source, id);
			}
		} catch {
			// Shiki or the grammar didn't download, so the code shows as it would with no grammar.
		}
	}
	lines ??= plainLines(source);
	const ranges = lineHighlights(meta);
	const children: HastNode[] = [];
	let hasHighlights = false;
	for (const [index, tokens] of lines.entries()) {
		if (index > 0) children.push(text('\n'));
		const highlighted = isHighlighted(ranges, index + 1);
		hasHighlights ||= highlighted;
		const className = highlighted ? ['line', 'highlighted'] : ['line'];
		const content = tokens.map(({ kind, text: value }) =>
			kind === 'plain' ? text(value) : span([`code-${kind}`], [text(value)])
		);
		if (index === 0 && label) {
			const code = span(['line-code'], content);
			code.properties.dataLabel = label;
			children.push(span(className, [code]));
		} else children.push(span(className, content));
	}
	const className = ['code-block'];
	if (lineNumbers) className.push('line-numbers');
	if (hasHighlights) className.push('has-highlights');
	const properties: Element['properties'] = { className };
	if (language) {
		properties.dataLanguage = language;
		properties.dataLabel = label;
	}
	return {
		type: 'element',
		tagName: 'pre',
		properties,
		children: [{ type: 'element', tagName: 'code', properties: {}, children: children as Element['children'] }]
	};
}

/** The Sätteri plugin that turns each `pre > code` block into `codeBlockTree`'s markup. */
export function codeBlocks(options: CodeBlockOptions): HastPluginDefinition {
	return defineHastPlugin({
		name: 'code-blocks',
		element: {
			filter: ['pre'],
			async visit(pre, context) {
				const [code, ...rest] = pre.children;
				if (rest.length > 0 || code?.type !== 'element' || code.tagName !== 'code') return;
				const { language, meta } = fenceOf(code);
				const tree = await codeBlockTree(context.textContent(code), language, meta, options);
				context.replaceNode(pre, tree);
			}
		}
	});
}
