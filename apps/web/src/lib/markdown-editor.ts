import { history, historyKeymap, defaultKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkup, markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
	Annotation,
	Compartment,
	EditorState,
	Facet,
	Prec,
	RangeSetBuilder,
	StateEffect,
	StateField,
	Transaction,
	type ChangeSpec,
	type Extension,
	type Text,
	type TransactionSpec
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	drawSelection,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	type Command,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { slideFrontmatter, splitDeck } from '#lib/deck-markdown.ts';

/** A slide's markdown cut in two at a `---` line: the slide keeps `before`, and a new slide after it takes `after`. */
export type SplitParts = { before: string; after: string };

/** What the editor tells the page that holds it. */
export type EditorHandlers = {
	/** The person changed the markdown. */
	change: (markdown: string) => void;
	/** The editor lost focus. */
	blur: () => void;
	/** The person chose to split the slide. The editor already shows `before`, and reports it through no `change`. */
	split: (parts: SplitParts) => void;
	/** The cursor moved, or the selection changed. */
	position: (label: string) => void;
	/** The editor was held read-only, or let go. */
	held: (isHeld: boolean) => void;
};

const separator = '---';

function trimBlankLines(lines: readonly string[]): string {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]!.trim() === '') start++;
	while (end > start && lines[end - 1]!.trim() === '') end--;
	return lines.slice(start, end).join('\n');
}

/**
 * Where the `---` on line `lineNumber` (counted from 1) would split `markdown` into two slides, or undefined when the
 * line wouldn't separate slides in a deck: inside fenced code, under paragraph text as a setext heading, as a
 * frontmatter delimiter, or with nothing but frontmatter above it. A YAML block right after the line stays the new
 * slide's frontmatter, as it would in a deck.
 */
export function splitAtRule(markdown: string, lineNumber: number): SplitParts | undefined {
	const lines = markdown.split('\n');
	const index = lineNumber - 1;
	if (lines[index] !== separator) return undefined;
	// What follows a separator can't change whether it is one, so a stand-in line shows how the deck would split here.
	const probe = splitDeck([...lines.slice(0, index + 1), 'x'].join('\n')).slides;
	if (probe.length < 2 || probe.at(-1) !== 'x') return undefined;
	const rest = [separator, ...lines.slice(index + 1)];
	const hasFrontmatter = slideFrontmatter(rest.join('\n'))?.format === 'yaml';
	return {
		before: trimBlankLines(lines.slice(0, index)),
		after: trimBlankLines(hasFrontmatter ? rest : rest.slice(1))
	};
}

/** The cursor's line and column, counted from 1, and how many characters are selected, as the pane header shows it. */
export function cursorLabel(state: EditorState): string {
	const { main } = state.selection;
	const line = state.doc.lineAt(main.head);
	const selected = state.selection.ranges.reduce((total, { from, to }) => total + to - from, 0);
	return `Ln ${line.number}, col ${main.head - line.from + 1}${selected > 0 ? ` · ${selected} selected` : ''}`;
}

/**
 * Puts the cursor at the start of line `number`, counted from 1 and kept within the document, and scrolls it to the
 * middle of the editor.
 */
export function goToLine(state: EditorState, number: number): TransactionSpec {
	const kept = Math.max(Math.trunc(number), 1);
	const line = state.doc.line(Math.min(kept, state.doc.lines));
	return {
		selection: { anchor: line.from },
		effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
		userEvent: 'select'
	};
}

/**
 * The number of the line that closes the frontmatter block `text` opens with, `---` for YAML or `+++` for TOML, or
 * undefined when it opens with none. It goes by the delimiters alone, so a block that doesn't parse still shows as one.
 */
export function frontmatterEnd(text: Text): number | undefined {
	const opener = text.line(1).text;
	if (opener !== '---' && opener !== '+++') return undefined;
	for (let number = 2; number <= text.lines; number++) {
		if (text.line(number).text === opener) return number;
	}
	return undefined;
}

/** The changes that turn `from` into `text`, touching only the part between what they share at each end. */
export function changesTo(from: Text, text: string): ChangeSpec | undefined {
	const current = from.toString();
	if (current === text) return undefined;
	let start = 0;
	const shortest = Math.min(current.length, text.length);
	while (start < shortest && current[start] === text[start]) start++;
	let end = 0;
	while (end < shortest - start && current.at(-1 - end) === text.at(-1 - end)) end++;
	return { from: start, to: current.length - end, insert: text.slice(start, text.length - end) };
}

/** Marks a transaction that brings in markdown from outside the editor, which the page already holds. */
const fromOutside = Annotation.define<boolean>();

const splitHandler = Facet.define<(parts: SplitParts) => void, (parts: SplitParts) => void>({
	combine: (handlers) => handlers.at(-1) ?? (() => {})
});

/** The slide's number in the deck, counted from 1. */
const slideNumber = Facet.define<number, number>({ combine: (numbers) => numbers.at(-1) ?? 1 });

const slideSettings = new Compartment();

const undoHistory = new Compartment();

function settingsFor(number: number): Extension {
	return [slideNumber.of(number), EditorView.contentAttributes.of({ 'aria-label': `Markdown for slide ${number}` })];
}

export const splitOfferCopy = {
	question: 'Split into two slides here?',
	detail: (next: number) => `The lines below become slide ${next}.`,
	split: 'Split',
	keep: 'Keep as a rule',
	announcement: (next: number) =>
		`Split into two slides here? The lines below become slide ${next}. Enter splits, Escape keeps the rule.`
};

class SplitOfferWidget extends WidgetType {
	constructor(readonly next: number) {
		super();
	}

	override eq(other: SplitOfferWidget) {
		return other.next === this.next;
	}

	toDOM(view: EditorView) {
		const offer = document.createElement('div');
		offer.className = 'cm-split-offer';
		offer.setAttribute('role', 'group');
		offer.setAttribute('aria-label', 'Split slide');
		const question = document.createElement('b');
		question.textContent = splitOfferCopy.question;
		const text = document.createElement('p');
		text.append(question, ` ${splitOfferCopy.detail(this.next)}`);
		offer.append(text);
		const button = (label: string, key: string, command: Command, isPrimary: boolean) => {
			const hint = document.createElement('kbd');
			hint.textContent = key;
			const element = document.createElement('button');
			element.type = 'button';
			element.className = isPrimary ? 'cm-split-button cm-split-primary' : 'cm-split-button';
			element.append(label, hint);
			offer.append(element);
			element.addEventListener('click', () => {
				command(view);
				view.focus();
			});
		};
		button(splitOfferCopy.split, 'Enter', acceptSplit, true);
		button(splitOfferCopy.keep, 'Esc', keepRule, false);
		// CodeMirror measures a block widget without its margins, and a margin would push the line numbers below it out
		// of line with their text, so the space around the offer is the padding of a box around it.
		const row = document.createElement('div');
		row.className = 'cm-split-row';
		row.append(offer);
		return row;
	}
}

const setHeld = StateEffect.define<boolean>();

/**
 * Whether the slide is read-only because the slide being typed in was deleted elsewhere, so the keys still coming
 * don't edit the slide shown in its place. A click, a focus from elsewhere or Escape lets it go.
 */
export const held = StateField.define<boolean>({
	create: () => false,
	update(isHeld, transaction) {
		for (const effect of transaction.effects) if (effect.is(setHeld)) return effect.value;
		return isHeld;
	},
	provide: (field) => EditorState.readOnly.from(field)
});

/** Holds the slide read-only, or lets it go. */
export function hold(isHeld: boolean): TransactionSpec {
	return { effects: setHeld.of(isHeld) };
}

/** Lets a held slide go. */
export const letGo: Command = (view) => {
	if (!view.state.field(held)) return false;
	view.dispatch(hold(false));
	return true;
};

const setSplitOffer = StateEffect.define<number>();

/**
 * The number of the `---` line the split offer shows under, or 0 while it doesn't show. Any edit or cursor move
 * closes it.
 */
export const splitOffer = StateField.define<number>({
	create: () => 0,
	update(line, transaction) {
		for (const effect of transaction.effects) if (effect.is(setSplitOffer)) return effect.value;
		return transaction.docChanged || transaction.selection ? 0 : line;
	},
	provide: (field) =>
		EditorView.decorations.compute([field, slideNumber], (state) => {
			const line = state.field(field);
			if (line === 0 || line > state.doc.lines) return Decoration.none;
			const widget = new SplitOfferWidget(state.facet(slideNumber) + 1);
			return Decoration.set(Decoration.widget({ widget, block: true, side: 1 }).range(state.doc.line(line).to));
		})
});

/**
 * Enter at the end of a `---` line that would separate slides offers to split the slide there, holding the new line
 * back; Enter again splits.
 */
export const offerSplit: Command = (view) => {
	const { state } = view;
	if (state.readOnly) return false;
	if (state.field(splitOffer) !== 0) return acceptSplit(view);
	const { main } = state.selection;
	if (state.selection.ranges.length > 1 || !main.empty) return false;
	const line = state.doc.lineAt(main.head);
	if (main.head !== line.to || !splitAtRule(state.doc.toString(), line.number)) return false;
	const next = state.facet(slideNumber) + 1;
	view.dispatch({
		effects: [setSplitOffer.of(line.number), EditorView.announce.of(splitOfferCopy.announcement(next))]
	});
	return true;
};

/** Splits the slide at the offered line: the slide keeps what is above it, and a new slide takes what is below. */
export const acceptSplit: Command = (view) => {
	const { state } = view;
	const line = state.field(splitOffer);
	if (line === 0) return false;
	const parts = splitAtRule(state.doc.toString(), line);
	if (!parts) {
		view.dispatch({ effects: setSplitOffer.of(0) });
		return false;
	}
	// Undo would bring the new slide's text back, or text deleted from it, so the slide starts a new history. The page
	// stores the part above with the new slide, in one write, so it hears of it through the split and not as an edit.
	view.dispatch({
		changes: changesTo(state.doc, parts.before),
		effects: [setSplitOffer.of(0), undoHistory.reconfigure([])],
		annotations: [fromOutside.of(true), Transaction.addToHistory.of(false)]
	});
	view.dispatch({ effects: undoHistory.reconfigure(history()) });
	state.facet(splitHandler)(parts);
	return true;
};

/** Closes the split offer and adds the new line it held back, so the `---` stays a thematic break. */
export const keepRule: Command = (view) => {
	if (view.state.field(splitOffer) === 0) return false;
	view.dispatch({ effects: setSplitOffer.of(0) });
	return insertNewlineContinueMarkup(view) || insertNewlineAndIndent(view);
};

const frontmatterLine = Decoration.line({ class: 'cm-frontmatter' });
const tomlKey = Decoration.mark({ class: 'cm-frontmatter-key' });
const frontmatterMark = Decoration.mark({ class: 'cm-frontmatter-mark' });
// The YAML parser colors YAML blocks; TOML blocks get their delimiters and keys colored here.
const tomlAssignment = /^(\s*)([\w.\-"']+)(\s*=)/;

function frontmatterDecorations(text: Text): DecorationSet {
	const end = frontmatterEnd(text);
	if (end === undefined) return Decoration.none;
	const isToml = text.line(1).text === '+++';
	const builder = new RangeSetBuilder<Decoration>();
	for (let number = 1; number <= end; number++) {
		const line = text.line(number);
		builder.add(line.from, line.from, frontmatterLine);
		if (!isToml) continue;
		if (number === 1 || number === end) {
			builder.add(line.from, line.to, frontmatterMark);
			continue;
		}
		const match = tomlAssignment.exec(line.text);
		if (!match) continue;
		const keyStart = line.from + match[1]!.length;
		const keyEnd = keyStart + match[2]!.length;
		builder.add(keyStart, keyEnd, tomlKey);
		builder.add(keyEnd, keyEnd + match[3]!.length, frontmatterMark);
	}
	return builder.finish();
}

const frontmatterBand = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = frontmatterDecorations(view.state.doc);
		}
		update(update: ViewUpdate) {
			if (update.docChanged) this.decorations = frontmatterDecorations(update.state.doc);
		}
	},
	{ decorations: (plugin) => plugin.decorations }
);

const highlightStyle = HighlightStyle.define([
	{ tag: [tags.processingInstruction, tags.meta, tags.url, tags.separator, tags.punctuation], color: 'var(--marks)' },
	{ tag: [tags.heading, tags.strong], color: 'var(--heading)' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	{ tag: tags.monospace, color: 'var(--heading)', backgroundColor: 'var(--surface)', borderRadius: '3px' },
	{ tag: tags.link, color: 'var(--link)' },
	{ tag: tags.contentSeparator, color: 'var(--rule)' },
	{ tag: [tags.propertyName, tags.definition(tags.propertyName)], color: 'var(--accent)' },
	{ tag: [tags.comment, tags.lineComment], color: 'var(--code-comment)' },
	{ tag: tags.quote, color: 'var(--muted)' }
]);

// The colors are the scheme's variables; `--marks`, `--curline` and `--fmband` are mixed from them by the component.
const theme = EditorView.theme({
	'&': { height: '100%', color: 'var(--text)', backgroundColor: 'transparent', fontSize: '14px' },
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': { fontFamily: 'var(--code-font)', lineHeight: '1.75', paddingBlock: '14px 24px' },
	'.cm-content': { padding: '0 20px 0 0', caretColor: 'var(--accent)' },
	'.cm-line': { padding: '0' },
	'.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--accent)' },
	'.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
		backgroundColor: 'var(--base02)'
	},
	'.cm-gutters': { backgroundColor: 'transparent', color: 'var(--marks)', border: 'none' },
	'.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', padding: '0 16px 0 0', fontSize: '12px' },
	'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--curline)' },
	'.cm-activeLineGutter': { color: 'var(--muted)' },
	'.cm-frontmatter': { backgroundColor: 'var(--fmband)' },
	'.cm-frontmatter-key': { color: 'var(--accent)' },
	'.cm-frontmatter-mark': { color: 'var(--marks)' },
	'.cm-split-row': { padding: '4px 0 6px' },
	'.cm-split-offer': {
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		gap: '10px 12px',
		padding: '10px 10px 10px 14px',
		border: '1px solid var(--border)',
		borderRadius: '10px',
		backgroundColor: 'var(--surface)',
		boxShadow: '0 8px 24px var(--shadow)',
		fontFamily: 'var(--ui-font)',
		lineHeight: '1.4'
	},
	'.cm-split-offer p': { flex: '1 1 220px', margin: '0', color: 'var(--text)' },
	'.cm-split-offer b': { fontWeight: '600', color: 'var(--heading)' },
	'.cm-split-button': {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '8px',
		minHeight: '36px',
		padding: '0 12px',
		border: '1px solid var(--border)',
		borderRadius: '8px',
		backgroundColor: 'var(--base00)',
		color: 'var(--heading)',
		font: '600 13px var(--ui-font)',
		cursor: 'pointer'
	},
	'.cm-split-button.cm-split-primary': {
		backgroundColor: 'var(--link)',
		borderColor: 'var(--link)',
		color: 'var(--on-primary)'
	},
	'.cm-split-button:focus-visible': { outline: '3px solid var(--accent)', outlineOffset: '2px' },
	'.cm-split-button kbd': {
		fontFamily: 'var(--code-font)',
		fontSize: '11px',
		border: '1px solid currentColor',
		borderRadius: '4px',
		padding: '0 5px',
		opacity: '0.75'
	}
});

/** The extensions every slide's editor state shares, reporting to `handlers`. */
export function editorExtensions(handlers: EditorHandlers): Extension {
	return [
		lineNumbers(),
		highlightActiveLine(),
		highlightActiveLineGutter(),
		drawSelection(),
		EditorView.lineWrapping,
		EditorState.tabSize.of(4),
		yamlFrontmatter({ content: markdown({ base: markdownLanguage, completeHTMLTags: false }) }),
		syntaxHighlighting(highlightStyle),
		frontmatterBand,
		splitOffer,
		splitHandler.of(handlers.split),
		held,
		Prec.highest(keymap.of([{ key: 'Escape', run: letGo }])),
		Prec.high(
			keymap.of([
				{ key: 'Enter', run: offerSplit },
				{ key: 'Escape', run: keepRule }
			])
		),
		keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
		theme,
		EditorView.updateListener.of((update) => {
			if (update.docChanged && update.transactions.every((transaction) => !transaction.annotation(fromOutside))) {
				handlers.change(update.state.doc.toString());
			}
			if (update.docChanged || update.selectionSet) handlers.position(cursorLabel(update.state));
			const isHeld = update.state.field(held);
			if (isHeld !== update.startState.field(held)) handlers.held(isHeld);
		}),
		EditorView.domEventHandlers({
			// CodeMirror notes a lost focus a moment later, after a click elsewhere has already run.
			blur: () => handlers.blur(),
			focus: (_event, view) => void letGo(view),
			mousedown: (_event, view) => void letGo(view)
		})
	];
}

/** A new editor state for a slide, with its own undo history. */
export function createSlideState(markdown: string, number: number, extensions: Extension): EditorState {
	return EditorState.create({
		doc: markdown,
		extensions: [extensions, undoHistory.of(history()), slideSettings.of(settingsFor(number))]
	});
}

/**
 * Brings `state` up to date with the slide's markdown and number as the page holds them, without reporting the change
 * back or adding it to the undo history. Returns the transaction to dispatch, or undefined when nothing differs.
 */
export function syncSlideState(
	state: EditorState,
	markdown: string,
	number: number
): Parameters<EditorView['dispatch']>[0] | undefined {
	const changes = changesTo(state.doc, markdown);
	const isRenumbered = state.facet(slideNumber) !== number;
	if (!changes && !isRenumbered) return undefined;
	return {
		changes,
		effects: isRenumbered ? slideSettings.reconfigure(settingsFor(number)) : undefined,
		annotations: [fromOutside.of(true), Transaction.addToHistory.of(false)]
	};
}
