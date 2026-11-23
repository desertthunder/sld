import { describe, expect, it } from 'vitest';
import {
	hashForSlide,
	keyAction,
	keyActions,
	keyLabel,
	moveTo,
	shortcutRows,
	slideFromHash,
	tapAction,
	type PresenterKey
} from '#lib/presenter-navigation.ts';

function press(key: string, held: Partial<PresenterKey> = {}): PresenterKey {
	return { key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...held };
}

describe('keyAction', () => {
	it.for(['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'l', 'j'])('reads %j as Next', (key) => {
		expect(keyAction(press(key))).toBe('next');
	});

	it.for(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'h', 'k'])('reads %j as Previous', (key) => {
		expect(keyAction(press(key))).toBe('previous');
	});

	it('reads Home and End as the first and last slide', () => {
		expect(keyAction(press('Home'))).toBe('first');
		expect(keyAction(press('End'))).toBe('last');
	});

	it('reads f as full screen, Escape as escape and ? as the shortcuts', () => {
		expect(keyAction(press('f'))).toBe('fullscreen');
		expect(keyAction(press('Escape'))).toBe('escape');
		expect(keyAction(press('?'))).toBe('help');
	});

	it('reads letters typed in upper case, as with Shift or Caps Lock', () => {
		expect(keyAction(press('L'))).toBe('next');
		expect(keyAction(press('K'))).toBe('previous');
		expect(keyAction(press('F'))).toBe('fullscreen');
	});

	it('leaves keys held with Ctrl, Cmd or Alt to the browser', () => {
		for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
			for (const key of Object.keys(keyActions)) expect(keyAction(press(key, held))).toBeUndefined();
		}
	});

	it('ignores keys it does not handle', () => {
		for (const key of ['a', 'Tab', 'Shift', 'o', '5', 'Delete', 'toString', 'constructor']) {
			expect(keyAction(press(key))).toBeUndefined();
		}
	});

	it('ignores a held toggle key but keeps moving while an arrow is held', () => {
		expect(keyAction(press('Escape', { repeat: true }))).toBeUndefined();
		expect(keyAction(press('f', { repeat: true }))).toBeUndefined();
		expect(keyAction(press('?', { repeat: true }))).toBeUndefined();
		expect(keyAction(press('ArrowRight', { repeat: true }))).toBe('next');
	});
});

describe('moveTo', () => {
	it('moves one slide forward and back', () => {
		expect(moveTo(2, 6, 'next')).toBe(3);
		expect(moveTo(2, 6, 'previous')).toBe(1);
	});

	it('stays on the last slide on Next and on the first on Previous', () => {
		expect(moveTo(5, 6, 'next')).toBe(5);
		expect(moveTo(0, 6, 'previous')).toBe(0);
	});

	it('jumps to the first and last slide', () => {
		expect(moveTo(3, 6, 'first')).toBe(0);
		expect(moveTo(3, 6, 'last')).toBe(5);
	});

	it('stays put on actions that do not move, and on a deck of one slide', () => {
		expect(moveTo(3, 6, 'help')).toBe(3);
		expect(moveTo(0, 1, 'next')).toBe(0);
		expect(moveTo(0, 1, 'last')).toBe(0);
	});
});

describe('slideFromHash', () => {
	it('reads the slide number, counting from 1', () => {
		expect(slideFromHash('#4', 6)).toBe(3);
		expect(slideFromHash('#1', 6)).toBe(0);
		expect(slideFromHash('4', 6)).toBe(3);
	});

	it('gives the nearest slide for a number past either end', () => {
		expect(slideFromHash('#0', 6)).toBe(0);
		expect(slideFromHash('#7', 6)).toBe(5);
		expect(slideFromHash('#99999999999999999999', 6)).toBe(5);
	});

	it('gives the first slide for an empty or unreadable hash', () => {
		for (const hash of ['', '#', '#junk', '#-2', '#2.5', '#1e3', '#4x']) expect(slideFromHash(hash, 6)).toBe(0);
	});

	it('round-trips with hashForSlide', () => {
		expect(hashForSlide(3)).toBe('#4');
		expect(slideFromHash(hashForSlide(3), 6)).toBe(3);
	});
});

describe('tapAction', () => {
	it('reads the right third as Next and the left third as Previous', () => {
		expect(tapAction(900, 900)).toBe('next');
		expect(tapAction(600, 900)).toBe('next');
		expect(tapAction(0, 900)).toBe('previous');
		expect(tapAction(299, 900)).toBe('previous');
	});

	it('ignores a tap in the middle third or on a surface with no width', () => {
		expect(tapAction(300, 900)).toBeUndefined();
		expect(tapAction(599, 900)).toBeUndefined();
		expect(tapAction(0, 0)).toBeUndefined();
	});
});

describe('shortcutRows', () => {
	it('lists every key the presenter handles, and no other', () => {
		const listed = shortcutRows.flatMap(({ keys }) => keys);
		expect(new Set(listed)).toEqual(new Set(Object.keys(keyActions)));
		expect(new Set(listed).size).toBe(listed.length);
	});

	it('lists each key with the action it does', () => {
		const descriptions: Record<string, string> = {
			next: 'Next slide',
			previous: 'Previous slide',
			first: 'First or last slide',
			last: 'First or last slide',
			fullscreen: 'Full screen on or off',
			escape: 'Leave full screen, then stop presenting',
			help: 'Show or hide shortcuts'
		};
		for (const { keys, description } of shortcutRows) {
			for (const key of keys) expect(description).toBe(descriptions[keyActions[key]!]);
		}
	});
});

describe('keyLabel', () => {
	it('shows arrows, names and letters as the help prints them', () => {
		expect(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].map((key) => keyLabel(key))).toEqual([
			'→',
			'↓',
			'←',
			'↑'
		]);
		expect([' ', 'Escape', 'PageDown', 'l', '?'].map((key) => keyLabel(key))).toEqual([
			'Space',
			'Esc',
			'PageDown',
			'L',
			'?'
		]);
	});
});
