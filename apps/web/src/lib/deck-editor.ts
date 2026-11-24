import type { DeckChange } from '#lib/decks.ts';

/** The search parameter that holds the selected slide's number, counted from 1. */
export const slideParameter = 'slide';

/**
 * The index, from 0, of the slide that `?slide=` selects in a deck of `count` slides. The parameter counts from 1; a
 * number past either end selects the slide at that end, and a missing or unreadable one selects the first slide.
 */
export function selectedIndex(parameter: string | undefined, count: number): number {
	if (parameter === undefined || !/^\s*[+-]?\d+\s*$/.test(parameter)) return 0;
	const index = Number(parameter) - 1;
	return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/** The `?slide=` value for the slide at `index`, from 0. */
export function slideParameterValue(index: number): string {
	return String(index + 1);
}

/** The index, from 0, of the slide to select once the slide at `index` is deleted from a deck of `count` slides. */
export function indexAfterDelete(index: number, count: number): number {
	return Math.max(Math.min(index, count - 2), 0);
}

/**
 * The index in `next` of the slide nearest the one at `index` in `previous` that `next` still holds: the first one from
 * there on, or else the last one before it.
 */
export function nearestKept(previous: readonly string[], next: readonly string[], index: number): number {
	const kept = new Map(next.map((id, at) => [id, at]));
	const found =
		previous.slice(index).find((id) => kept.has(id)) ?? previous.slice(0, index).findLast((id) => kept.has(id));
	return found === undefined ? Math.min(index, Math.max(next.length - 1, 0)) : kept.get(found)!;
}

/** A slide as the editor lists it. */
export type SlideItem = { id: string; markdown: string };

/**
 * `list` with `change` made to it, as `applyDeckChanges` makes it to the stored slides. A change that wouldn't apply
 * there, such as one whose slide is gone, leaves `list` as it was.
 */
export function withChange(list: readonly SlideItem[], change: DeckChange): SlideItem[] {
	switch (change.kind) {
		case 'rename':
		case 'scheme': {
			return [...list];
		}
		case 'update': {
			return list.map((slide) => (slide.id === change.id ? { id: slide.id, markdown: change.markdown } : slide));
		}
		case 'insert':
		case 'duplicate': {
			const at = list.findIndex(({ id }) => id === (change.kind === 'insert' ? change.after : change.of));
			return at === -1 ? [...list] : list.toSpliced(at + 1, 0, { id: change.id, markdown: change.markdown });
		}
		case 'delete': {
			const at = list.findIndex(({ id }) => id === change.id);
			return at === -1 || list.length <= 1 ? [...list] : list.toSpliced(at, 1);
		}
	}
}

/** Whether a deck of `count` slides may lose one: a deck always keeps at least one slide. */
export function canDeleteSlide(count: number): boolean {
	return count > 1;
}

/** The slide list's width in pixels, and the editor's share of the width left for the editor and the preview. */
export type PaneWidths = { list: number; editor: number };

export const paneLimits = {
	list: { min: 180, max: 420, step: 16 },
	editor: { min: 0.2, max: 0.8, step: 0.02 }
} as const;

export const defaultPaneWidths: PaneWidths = { list: 248, editor: 0.47 };

/** The `localStorage` key that holds the pane widths. */
export const paneWidthsKey = 'sld:pane-widths';

function clamp(value: number, { min, max }: { min: number; max: number }): number {
	return Math.min(Math.max(value, min), max);
}

/** Holds both widths within their limits. */
export function clampPaneWidths({ list, editor }: PaneWidths): PaneWidths {
	return { list: Math.round(clamp(list, paneLimits.list)), editor: clamp(editor, paneLimits.editor) };
}

/** Reads stored pane widths, falling back to the default for any width that is missing or isn't a number. */
export function parsePaneWidths(stored = ''): PaneWidths {
	let value: unknown;
	try {
		value = JSON.parse(stored);
	} catch {
		return defaultPaneWidths;
	}
	if (typeof value !== 'object' || value === null) return defaultPaneWidths;
	const { list, editor } = value as Record<string, unknown>;
	return clampPaneWidths({
		list: typeof list === 'number' && Number.isFinite(list) ? list : defaultPaneWidths.list,
		editor: typeof editor === 'number' && Number.isFinite(editor) ? editor : defaultPaneWidths.editor
	});
}

/** The panes as tabs at phone width. */
export const editorTabs = ['slides', 'edit', 'preview'] as const;

export type EditorTab = (typeof editorTabs)[number];

export const tabLabels: Record<EditorTab, string> = { slides: 'Slides', edit: 'Edit', preview: 'Preview' };

/** The `sessionStorage` key that holds the chosen tab, so it survives a reload of the same tab. */
export const editorTabKey = 'sld:editor-tab';

/** The width, in CSS pixels, at and below which the panes become tabs. */
export const phoneWidth = 760;

/** Reads a stored tab, falling back to the editor. */
export function parseEditorTab(stored?: string): EditorTab {
	return editorTabs.find((tab) => tab === stored) ?? 'edit';
}

/** What a key pressed in the slide list does. */
export type ListCommand = 'previous' | 'next' | 'first' | 'last' | 'add' | 'duplicate' | 'delete';

type Key = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

const listKeys: Record<string, ListCommand> = {
	ArrowUp: 'previous',
	ArrowDown: 'next',
	Home: 'first',
	End: 'last',
	n: 'add',
	d: 'duplicate',
	Delete: 'delete',
	Backspace: 'delete'
};

/**
 * The command a key pressed in the slide list gives, or `undefined`. Keys with a modifier other than Shift belong to
 * the browser and the system, so they give none.
 */
export function listCommand({ key, altKey, ctrlKey, metaKey }: Key): ListCommand | undefined {
	if (altKey || ctrlKey || metaKey) return;
	return listKeys[key.length === 1 ? key.toLowerCase() : key];
}

/** Describes the slide list's keys, for its accessible description. */
export const listKeysHint =
	'Up and Down arrows choose a slide. N adds a slide after it, D duplicates it, and Delete removes it.';

const separator = '---';

/** The two parts a split cuts a slide's markdown into. */
export type SlideParts = { before: string; after: string };

/**
 * Puts back together the parts `splitAtRule` cut `markdown` into, as they have been edited since. The lines around and
 * between the parts come back as they were, so joining the parts unedited gives `markdown` again. However the parts
 * are edited, emptied or filled, the `---` keeps a line of its own and stays a rule.
 */
export function joinSplit(markdown: string, { before, after }: SlideParts): (parts: SlideParts) => string {
	const lines = markdown.split('\n');
	const first = lines.findIndex((line) => line.trim() !== '');
	const last = lines.findLastIndex((line) => line.trim() !== '');
	const start = lines.slice(0, Math.max(first, 0)).join('\n').length + (first > 0 ? 1 : 0);
	const contentEnd = lines.slice(0, last + 1).join('\n').length;
	const end = contentEnd - after.length;
	if (
		first === -1 ||
		!markdown.startsWith(before, start) ||
		!markdown.startsWith(after, end) ||
		end < start + before.length
	) {
		return (parts) => `${parts.before}\n\n${separator}${parts.after === '' ? '' : `\n\n${parts.after}`}`;
	}
	const head = markdown.slice(0, start);
	const between = markdown.slice(start + before.length, end);
	const tail = markdown.slice(contentEnd);
	const hasRule = between.split('\n').includes(separator);
	return (parts) => {
		// Text typed on the line above would make the rule a setext underline, so an edited part above gets a blank line.
		const isEdited = parts.before !== before;
		let gap = isEdited && !/^\n[ \t]*\n/.test(between) ? `\n${between}` : between;
		// A YAML block that opened the part below carried the rule; it goes back when that block is gone.
		if (!hasRule && parts.after.split('\n', 1)[0] !== separator) gap += separator;
		// Nothing followed the rule, so text that does now needs a line of its own.
		if (!gap.endsWith('\n') && parts.after !== '') gap += '\n\n';
		return `${head}${parts.before}${gap}${parts.after}${tail}`;
	};
}
