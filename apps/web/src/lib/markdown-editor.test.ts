import { undo } from '@codemirror/commands';
import { EditorSelection, EditorState, Text, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
	acceptSplit,
	changesTo,
	createSlideState,
	cursorLabel,
	editorExtensions,
	frontmatterEnd,
	goToLine,
	held,
	hold,
	keepRule,
	letGo,
	offerSplit,
	splitAtRule,
	splitOffer,
	syncSlideState,
	type SplitParts
} from '#lib/markdown-editor.ts';
import { joinSplit } from '#lib/deck-editor.ts';

describe('splitAtRule', () => {
	it('splits at a `---` after a blank line, dropping the blank lines around it', () => {
		expect(splitAtRule('# One\n\nText\n\n---\n\n# Two\n', 5)).toEqual({ before: '# One\n\nText', after: '# Two' });
	});

	it('gives the new slide nothing when the `---` is the last line', () => {
		expect(splitAtRule('# One\n---', 2)).toEqual({ before: '# One', after: '' });
	});

	it('splits under a heading or a list, which a `---` cannot underline', () => {
		expect(splitAtRule('# One\n---\nNext', 2)).toEqual({ before: '# One', after: 'Next' });
		expect(splitAtRule('- one\n- two\n---', 3)).toEqual({ before: '- one\n- two', after: '' });
	});

	it('leaves a line that is not exactly `---` alone', () => {
		expect(splitAtRule('# One\n\n--- ', 3)).toBeUndefined();
		expect(splitAtRule('# One\n\n***', 3)).toBeUndefined();
		expect(splitAtRule('# One\n\n----', 3)).toBeUndefined();
	});

	it('leaves a setext underline under paragraph text alone', () => {
		expect(splitAtRule('Some text\n---', 2)).toBeUndefined();
	});

	it('leaves a `---` inside fenced code alone', () => {
		expect(splitAtRule('```yaml\n\n---\n', 3)).toBeUndefined();
	});

	it('leaves the delimiters of the slide frontmatter alone, and splits after it', () => {
		const markdown = '---\nlayout: center\n---\n# One\n\n---';
		expect(splitAtRule(markdown, 1)).toBeUndefined();
		expect(splitAtRule(markdown, 3)).toBeUndefined();
		expect(splitAtRule(markdown, 6)).toEqual({ before: '---\nlayout: center\n---\n# One', after: '' });
		expect(splitAtRule('+++\nlayout = "center"\n+++\n\n---', 5)).toBeUndefined();
	});

	it('offers nothing with nothing above the line', () => {
		expect(splitAtRule('---', 1)).toBeUndefined();
		expect(splitAtRule('\n\n---\n# Two', 3)).toBeUndefined();
	});

	it('keeps a YAML block right after the line as the new slide frontmatter', () => {
		expect(splitAtRule('# One\n\n---\nlayout: center\n---\n# Two', 3)).toEqual({
			before: '# One',
			after: '---\nlayout: center\n---\n# Two'
		});
	});
});

describe('joinSplit', () => {
	const cases: [string, number][] = [
		['# One\n\nText\n\n---\n\n# Two\n', 5],
		['\n# One\n---', 3],
		['# One\n---\nNext', 2],
		['---\nlayout: center\n---\n# One\n\n---', 6],
		['# One\n\n---\nlayout: center\n---\n# Two\n\n', 3],
		['# One\n  \n---\n\t\n# Two', 3]
	];

	it('gives back the markdown from the parts it was cut into', () => {
		for (const [markdown, line] of cases) {
			const parts = splitAtRule(markdown, line)!;
			expect(joinSplit(markdown, parts)(parts)).toBe(markdown);
		}
	});

	it('keeps the lines between the parts as they were around edited parts', () => {
		const markdown = '# Agenda\n\nkeep me EXTRA\n\n---\n\nmove me';
		const join = joinSplit(markdown, splitAtRule(markdown, 5)!);
		expect(join({ before: '# Agenda\n\nkeep me EXTRA!', after: 'moved' })).toBe(
			'# Agenda\n\nkeep me EXTRA!\n\n---\n\nmoved'
		);
		expect(join({ before: '', after: '' })).toBe('\n\n---\n\n');
	});

	it('gives the rule a line of its own above text typed into a new slide that started empty', () => {
		const markdown = '# Solo\n\nlast line\n\n---';
		const parts = splitAtRule(markdown, 5)!;
		expect(parts).toEqual({ before: '# Solo\n\nlast line', after: '' });
		const join = joinSplit(markdown, parts);
		expect(join(parts)).toBe(markdown);
		expect(join({ before: parts.before, after: 'Next' })).toBe('# Solo\n\nlast line\n\n---\n\nNext');
		expect(join({ before: '# Solo', after: '' })).toBe('# Solo\n\n---');
	});

	it('keeps the blank lines after a rule on the last line below the typed text', () => {
		const markdown = '\n# One\n---\n\n';
		const join = joinSplit(markdown, splitAtRule(markdown, 3)!);
		expect(join({ before: '# One', after: 'Next' })).toBe('\n# One\n---\n\nNext\n\n');
	});

	it('keeps the rule on its own line, never the first, when the part above is emptied', () => {
		const markdown = '# One\n---\nNext';
		const join = joinSplit(markdown, splitAtRule(markdown, 2)!);
		expect(join({ before: '', after: 'Next' })).toBe('\n\n---\nNext');
		expect(join({ before: '', after: '' })).toBe('\n\n---\n');
		const last = '# One\n\n---';
		expect(joinSplit(last, splitAtRule(last, 3)!)({ before: '', after: 'Next' })).toBe('\n\n---\n\nNext');
	});

	it('puts a blank line under edited text above a rule, so it never becomes a setext underline', () => {
		const markdown = '# One\n---\nNext';
		const join = joinSplit(markdown, splitAtRule(markdown, 2)!);
		expect(join({ before: '# One\nmore', after: 'Next' })).toBe('# One\nmore\n\n---\nNext');
	});

	it('puts the rule back when the YAML block that carried it is cut from the new slide', () => {
		const markdown = '# One\n\n---\nlayout: center\n---\n# Two';
		const join = joinSplit(markdown, splitAtRule(markdown, 3)!);
		expect(join({ before: '# One', after: '# Two' })).toBe('# One\n\n---\n\n# Two');
		expect(join({ before: '# One', after: '' })).toBe('# One\n\n---');
	});

	it('joins a second split made on the last line of the slide the first split made', () => {
		const root = '# Solo\n\n---';
		const first = joinSplit(root, splitAtRule(root, 3)!);
		const copy = 'move me\n\n---';
		const second = joinSplit(copy, splitAtRule(copy, 3)!);
		const after = second({ before: 'move me', after: 'THIRD' });
		expect(after).toBe('move me\n\n---\n\nTHIRD');
		expect(first({ before: '# Solo', after })).toBe('# Solo\n\n---\n\nmove me\n\n---\n\nTHIRD');
	});
});

describe('cursorLabel', () => {
	it('counts the line and column from 1', () => {
		const state = EditorState.create({ doc: '# One\nTwo', selection: { anchor: 8 } });
		expect(cursorLabel(state)).toBe('Ln 2, col 3');
	});

	it('adds how many characters are selected', () => {
		const state = EditorState.create({ doc: '# One\nTwo', selection: { anchor: 2, head: 9 } });
		expect(cursorLabel(state)).toBe('Ln 2, col 4 · 7 selected');
	});
});

describe('goToLine', () => {
	const state = EditorState.create({ doc: '---\nlayout: [\n---\n# Title', selection: { anchor: 0 } });
	const lineAfter = (number: number) => {
		const next = state.update(goToLine(state, number)).state;
		return next.doc.lineAt(next.selection.main.head).number;
	};

	it('puts the cursor at the start of the line', () => {
		const next = state.update(goToLine(state, 2)).state;
		expect(next.selection.main.head).toBe(state.doc.line(2).from);
		expect(cursorLabel(next)).toBe('Ln 2, col 1');
	});

	it('keeps a line out of range within the document', () => {
		expect(lineAfter(0)).toBe(1);
		expect(lineAfter(99)).toBe(4);
	});
});

describe('frontmatterEnd', () => {
	it('finds the closing delimiter of a YAML or TOML block on the first line', () => {
		expect(frontmatterEnd(Text.of(['---', 'layout: center', '---', '# One']))).toBe(3);
		expect(frontmatterEnd(Text.of(['+++', 'layout = "center"', '+++']))).toBe(3);
	});

	it('finds none without an opening and a matching closing delimiter', () => {
		expect(frontmatterEnd(Text.of(['# One', '---']))).toBeUndefined();
		expect(frontmatterEnd(Text.of(['+++', 'layout = "center"', '---']))).toBeUndefined();
	});
});

describe('changesTo', () => {
	it('replaces only the part that differs', () => {
		expect(changesTo(Text.of(['# One, edited']), '# One, more edited')).toEqual({
			from: 7,
			to: 7,
			insert: 'more '
		});
		expect(changesTo(Text.of(['abcabc']), 'abc')).toEqual({ from: 3, to: 6, insert: '' });
		expect(changesTo(Text.of(['same']), 'same')).toBeUndefined();
	});
});

/** A stand-in for an editor view that holds a state and applies what is dispatched, enough for the commands. */
function fakeView(markdown: string, cursor: number) {
	const splits: SplitParts[] = [];
	const extensions = editorExtensions({
		change: () => {},
		blur: () => {},
		split: (parts) => void splits.push(parts),
		position: () => {},
		held: () => {}
	});
	const view = {
		state: createSlideState(markdown, 1, extensions).update({ selection: EditorSelection.cursor(cursor) }).state,
		dispatch(...specs: TransactionSpec[]) {
			view.state = view.state.update(...specs).state;
		}
	};
	return { view: view as unknown as EditorView & typeof view, splits };
}

describe('the split offer', () => {
	const markdown = '# One\n\n---\n# Two';

	it('opens on Enter at the end of a `---` line, holding the new line back', () => {
		const { view } = fakeView(markdown, 10);
		expect(offerSplit(view)).toBe(true);
		expect(view.state.field(splitOffer)).toBe(3);
		expect(view.state.doc.toString()).toBe(markdown);
	});

	it('does not open anywhere else, or on a `---` that cannot split', () => {
		expect(offerSplit(fakeView(markdown, 8).view)).toBe(false);
		expect(offerSplit(fakeView(markdown, 5).view)).toBe(false);
		expect(offerSplit(fakeView('Text\n---', 8).view)).toBe(false);
	});

	it('splits on a second Enter, keeping the part above in the slide and out of the undo history', () => {
		const { view, splits } = fakeView(markdown, 10);
		offerSplit(view);
		expect(offerSplit(view)).toBe(true);
		expect(splits).toEqual([{ before: '# One', after: '# Two' }]);
		expect(view.state.doc.toString()).toBe('# One');
		expect(view.state.field(splitOffer)).toBe(0);
	});

	it('starts a new undo history on a split, so undo brings back nothing from below the line', () => {
		const { view } = fakeView('# One\n\n---\n# Two, more', 10);
		view.dispatch({ changes: { from: 16, to: 22 } });
		view.dispatch({ selection: EditorSelection.cursor(10) });
		offerSplit(view);
		offerSplit(view);
		expect(view.state.doc.toString()).toBe('# One');
		expect(undo(view)).toBe(false);
		expect(view.state.doc.toString()).toBe('# One');
		view.dispatch({ changes: { from: 5, insert: '!' } });
		expect(undo(view)).toBe(true);
		expect(view.state.doc.toString()).toBe('# One');
	});

	it('closes on Escape and adds the new line, keeping the rule', () => {
		const { view, splits } = fakeView(markdown, 10);
		offerSplit(view);
		expect(keepRule(view)).toBe(true);
		expect(view.state.doc.toString()).toBe('# One\n\n---\n\n# Two');
		expect(view.state.field(splitOffer)).toBe(0);
		expect(splits).toEqual([]);
		expect(keepRule(view)).toBe(false);
	});

	it('closes when the cursor moves or the text changes', () => {
		const { view } = fakeView(markdown, 10);
		offerSplit(view);
		view.dispatch({ selection: EditorSelection.cursor(2) });
		expect(view.state.field(splitOffer)).toBe(0);
		expect(acceptSplit(view)).toBe(false);
	});
});

describe('holding a slide', () => {
	it('makes it read-only, so neither typing nor a split edits it, until it is let go', () => {
		const { view, splits } = fakeView('# One\n\n---\n# Two', 10);
		view.dispatch(hold(true));
		expect(view.state.readOnly).toBe(true);
		expect(offerSplit(view)).toBe(false);
		expect(splits).toEqual([]);
		expect(letGo(view)).toBe(true);
		expect(view.state.field(held)).toBe(false);
		expect(view.state.readOnly).toBe(false);
		expect(letGo(view)).toBe(false);
	});

	it('still takes markdown from outside while held', () => {
		const { view } = fakeView('# Two', 0);
		view.dispatch(hold(true));
		view.dispatch(syncSlideState(view.state, '# Two, renamed', 1)!);
		expect(view.state.doc.toString()).toBe('# Two, renamed');
		expect(view.state.readOnly).toBe(true);
	});
});

describe('syncSlideState', () => {
	const extensions = editorExtensions({
		change: () => {},
		blur: () => {},
		split: () => {},
		position: () => {},
		held: () => {}
	});

	it('brings in outside markdown without adding it to the undo history', () => {
		const state = createSlideState('# One', 1, extensions);
		const update = syncSlideState(state, '# One, stored', 1);
		expect(update).toBeDefined();
		const next = state.update(update!).state;
		expect(next.doc.toString()).toBe('# One, stored');
		expect(syncSlideState(next, '# One, stored', 1)).toBeUndefined();
	});

	it('renumbers the slide', () => {
		const state = createSlideState('# One', 1, extensions);
		expect(syncSlideState(state, '# One', 2)).toBeDefined();
	});
});
