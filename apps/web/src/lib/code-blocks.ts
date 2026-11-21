import { defineHastPlugin, type HastNode, type HastPluginDefinition } from 'satteri';
import type { Token } from '#lib/code-highlight.ts';
import { isHighlighted, lineHighlights } from '#lib/line-highlights.ts';

type Element = Extract<HastNode, { type: 'element' }>;
type Text = Extract<HastNode, { type: 'text' }>;

/** What a deck sets for its code blocks. */
export type CodeBlockOptions = { lineNumbers: boolean };

const languagePrefix = 'language-';

function languageOf(code: Element): string | undefined {
	const classes = code.properties.className;
	if (!Array.isArray(classes)) return undefined;
	const name = classes.find((value) => typeof value === 'string' && value.startsWith(languagePrefix));
	return typeof name === 'string' ? name.slice(languagePrefix.length) : undefined;
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
 * downloaded only when a block names a language it knows; any other block shows as plain text.
 */
export async function codeBlockTree(
	code: string,
	language: string | undefined,
	meta: string | undefined,
	{ lineNumbers }: CodeBlockOptions
): Promise<Element> {
	const source = code.endsWith('\n') ? code.slice(0, -1) : code;
	let lines: Token[][] | undefined;
	if (language) {
		const { highlightCode } = await import('#lib/code-highlight.ts');
		lines = await highlightCode(source, language);
	}
	lines ??= plainLines(source);
	const ranges = lineHighlights(meta);
	const children: HastNode[] = [];
	for (const [index, tokens] of lines.entries()) {
		if (index > 0) children.push(text('\n'));
		const className = isHighlighted(ranges, index + 1) ? ['line', 'highlighted'] : ['line'];
		children.push(
			span(
				className,
				tokens.map(({ kind, text: value }) =>
					kind === 'plain' ? text(value) : span([`code-${kind}`], [text(value)])
				)
			)
		);
	}
	const className = ['code-block'];
	if (lineNumbers) className.push('line-numbers');
	if (ranges.length > 0) className.push('has-highlights');
	const properties: Element['properties'] = { className };
	if (language) properties.dataLanguage = language;
	if (lineNumbers) properties.style = `--line-digits: ${String(lines.length).length}`;
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
				const meta = (code.data as { meta?: unknown } | undefined)?.meta;
				const tree = await codeBlockTree(
					context.textContent(code),
					languageOf(code),
					typeof meta === 'string' ? meta : undefined,
					options
				);
				context.replaceNode(pre, tree);
			}
		}
	});
}
