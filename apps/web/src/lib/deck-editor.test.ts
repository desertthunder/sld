import { describe, expect, it } from 'vitest';
import {
	canDeleteSlide,
	clampPaneWidths,
	defaultPaneWidths,
	indexAfterDelete,
	nearestKept,
	withChange,
	listCommand,
	paneLimits,
	parseEditorTab,
	parsePaneWidths,
	selectedIndex,
	slideParameterValue
} from '#lib/deck-editor.ts';

describe('selectedIndex', () => {
	it('reads the slide number, counted from 1', () => {
		expect(selectedIndex('1', 5)).toBe(0);
		expect(selectedIndex('3', 5)).toBe(2);
		expect(selectedIndex('5', 5)).toBe(4);
	});

	it('selects the slide at the nearer end for a number out of range', () => {
		expect(selectedIndex('9', 5)).toBe(4);
		expect(selectedIndex('0', 5)).toBe(0);
		expect(selectedIndex('-2', 5)).toBe(0);
		expect(selectedIndex('99999999999999999999', 5)).toBe(4);
	});

	it('selects the first slide when the parameter is missing or unreadable', () => {
		for (const parameter of [undefined, '', 'three', '2.5', '1e2', '0x2', '2abc']) {
			expect(selectedIndex(parameter, 5)).toBe(0);
		}
	});

	it('selects the first slide of a deck with none', () => {
		expect(selectedIndex('4', 0)).toBe(0);
	});

	it('round-trips with the parameter value', () => {
		expect(selectedIndex(slideParameterValue(3), 5)).toBe(3);
		expect(slideParameterValue(0)).toBe('1');
	});
});

describe('deleting the selected slide', () => {
	it('selects the next slide, or the previous one when the last slide goes', () => {
		expect(indexAfterDelete(0, 3)).toBe(0);
		expect(indexAfterDelete(1, 3)).toBe(1);
		expect(indexAfterDelete(2, 3)).toBe(1);
	});

	it('never leaves a deck with zero slides', () => {
		expect(canDeleteSlide(2)).toBe(true);
		expect(canDeleteSlide(1)).toBe(false);
		expect(canDeleteSlide(0)).toBe(false);
	});
});

describe('nearestKept', () => {
	it('keeps the slide at the index when it is still there, wherever it went', () => {
		expect(nearestKept(['a', 'b', 'c'], ['x', 'a', 'b', 'c'], 1)).toBe(2);
	});

	it('takes the next slide still there, or else the last one before', () => {
		expect(nearestKept(['a', 'b', 'c', 'd'], ['a', 'd'], 1)).toBe(1);
		expect(nearestKept(['a', 'b', 'c'], ['a', 'x'], 2)).toBe(0);
		expect(nearestKept(['a', 'b'], ['x', 'y'], 1)).toBe(1);
		expect(nearestKept(['a', 'b', 'c'], ['x'], 2)).toBe(0);
	});
});

const ids = (slides: { id: string }[]) => slides.map(({ id }) => id);

describe('withChange', () => {
	const list = [
		{ id: 'a', markdown: '# A' },
		{ id: 'b', markdown: '# B' }
	];

	it('places new slides and copies after the slide they name', () => {
		expect(ids(withChange(list, { kind: 'insert', id: 'n', after: 'a', markdown: '' }))).toEqual(['a', 'n', 'b']);
		expect(withChange(list, { kind: 'duplicate', of: 'b', id: 'c', markdown: '# B' })).toEqual([
			...list,
			{ id: 'c', markdown: '# B' }
		]);
	});

	it('edits and deletes by id, and keeps the last slide', () => {
		expect(withChange(list, { kind: 'update', id: 'b', markdown: '# Bee' })[1]).toEqual({
			id: 'b',
			markdown: '# Bee'
		});
		expect(ids(withChange(list, { kind: 'delete', id: 'a' }))).toEqual(['b']);
		expect(withChange([list[0]!], { kind: 'delete', id: 'a' })).toEqual([list[0]]);
	});

	it('leaves the list as it was for a change whose slide is gone, or one that is not about slides', () => {
		for (const change of [
			{ kind: 'insert', id: 'n', after: 'x', markdown: '' },
			{ kind: 'duplicate', of: 'x', id: 'n', markdown: '' },
			{ kind: 'update', id: 'x', markdown: '' },
			{ kind: 'delete', id: 'x' },
			{ kind: 'rename', title: 'Talk' },
			{ kind: 'scheme', scheme: 'nord' }
		] as const) {
			expect(withChange(list, change)).toEqual(list);
		}
	});
});

describe('pane widths', () => {
	it('reads stored widths', () => {
		expect(parsePaneWidths(JSON.stringify({ list: 300, editor: 0.6 }))).toEqual({ list: 300, editor: 0.6 });
	});

	it('falls back to the defaults for missing or unreadable widths', () => {
		expect(parsePaneWidths()).toEqual(defaultPaneWidths);
		expect(parsePaneWidths('{')).toEqual(defaultPaneWidths);
		expect(parsePaneWidths('42')).toEqual(defaultPaneWidths);
		expect(parsePaneWidths(JSON.stringify({ list: 'wide', editor: {} }))).toEqual(defaultPaneWidths);
		expect(parsePaneWidths(JSON.stringify({ list: 320 }))).toEqual({ ...defaultPaneWidths, list: 320 });
	});

	it('holds widths within their limits', () => {
		expect(parsePaneWidths(JSON.stringify({ list: 9999, editor: -1 }))).toEqual({
			list: paneLimits.list.max,
			editor: paneLimits.editor.min
		});
		expect(clampPaneWidths({ list: 10.4, editor: 2 })).toEqual({
			list: paneLimits.list.min,
			editor: paneLimits.editor.max
		});
	});
});

describe('parseEditorTab', () => {
	it('reads a stored tab and falls back to the editor', () => {
		expect(parseEditorTab('slides')).toBe('slides');
		expect(parseEditorTab('preview')).toBe('preview');
		expect(parseEditorTab()).toBe('edit');
		expect(parseEditorTab('settings')).toBe('edit');
	});
});

type Modifiers = Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>>;

function key(name: string, modifiers: Modifiers = {}) {
	return { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers };
}

describe('listCommand', () => {
	it('maps keys to commands', () => {
		expect(listCommand(key('ArrowUp'))).toBe('previous');
		expect(listCommand(key('ArrowDown'))).toBe('next');
		expect(listCommand(key('Home'))).toBe('first');
		expect(listCommand(key('End'))).toBe('last');
		expect(listCommand(key('n'))).toBe('add');
		expect(listCommand(key('N', { shiftKey: true }))).toBe('add');
		expect(listCommand(key('d'))).toBe('duplicate');
		expect(listCommand(key('Delete'))).toBe('delete');
		expect(listCommand(key('Backspace'))).toBe('delete');
	});

	it('leaves other keys and modified keys alone', () => {
		expect(listCommand(key('x'))).toBeUndefined();
		expect(listCommand(key('Enter'))).toBeUndefined();
		expect(listCommand(key('d', { metaKey: true }))).toBeUndefined();
		expect(listCommand(key('n', { ctrlKey: true }))).toBeUndefined();
		expect(listCommand(key('ArrowUp', { altKey: true }))).toBeUndefined();
	});
});
