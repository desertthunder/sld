/** What a key, a tap or a control asks the presenter to do. */
export type PresenterAction = 'next' | 'previous' | 'first' | 'last' | 'fullscreen' | 'escape' | 'help';

/** The parts of a keyboard event the presenter reads. */
export type PresenterKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'>;

/** A row of the shortcuts help: the keys it names, as `KeyboardEvent.key` values, or a gesture, and what they do. */
export type ShortcutRow = { keys: readonly string[]; gesture?: string; description: string };

/** How long the cursor and the controls stay after the pointer last moved, in milliseconds. */
export const controlsDelay = 2000;

/** Every key the presenter handles, by its `KeyboardEvent.key` value, with letters in lower case. */
export const keyActions: Readonly<Record<string, PresenterAction>> = {
	ArrowRight: 'next',
	ArrowDown: 'next',
	' ': 'next',
	PageDown: 'next',
	Enter: 'next',
	l: 'next',
	j: 'next',
	ArrowLeft: 'previous',
	ArrowUp: 'previous',
	PageUp: 'previous',
	Backspace: 'previous',
	h: 'previous',
	k: 'previous',
	Home: 'first',
	End: 'last',
	f: 'fullscreen',
	Escape: 'escape',
	'?': 'help'
};

/** The rows of the shortcuts help, in order. */
export const shortcutRows: readonly ShortcutRow[] = [
	{ keys: ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'l', 'j'], description: 'Next slide' },
	{ keys: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'h', 'k'], description: 'Previous slide' },
	{ keys: ['Home', 'End'], description: 'First or last slide' },
	{ keys: [], gesture: 'Tap the right or left third', description: 'Next or previous slide' },
	{ keys: ['f'], description: 'Full screen on or off' },
	{ keys: ['Escape'], description: 'Leave full screen, then stop presenting' },
	{ keys: ['?'], description: 'Show or hide shortcuts' }
];

const keyLabels: Readonly<Record<string, string>> = {
	ArrowRight: '→',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowUp: '↑',
	' ': 'Space',
	Escape: 'Esc'
};

/** How the shortcuts help shows a key: an arrow, a name, or a letter in upper case. */
export function keyLabel(key: string): string {
	return keyLabels[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

// Holding a key that toggles something would toggle it back and forth.
const toggles = new Set<PresenterAction>(['fullscreen', 'escape', 'help']);

/**
 * The action a key press asks for, or undefined for a key the presenter leaves alone: an unknown key, one held with
 * Ctrl, Cmd or Alt, so browser and system shortcuts keep working, or a held key that toggles something.
 */
export function keyAction({ key, ctrlKey, metaKey, altKey, repeat }: PresenterKey): PresenterAction | undefined {
	if (ctrlKey || metaKey || altKey) return undefined;
	const action = Object.hasOwn(keyActions, key)
		? keyActions[key]
		: key.length === 1 && Object.hasOwn(keyActions, key.toLowerCase())
			? keyActions[key.toLowerCase()]
			: undefined;
	return action && repeat && toggles.has(action) ? undefined : action;
}

/**
 * The index of the slide an action moves to from `index` in a deck of `total` slides. Next on the last slide and
 * Previous on the first stay where they are, and actions that don't move return `index`.
 */
export function moveTo(index: number, total: number, action: PresenterAction): number {
	const last = Math.max(total - 1, 0);
	switch (action) {
		case 'next': {
			return Math.min(index + 1, last);
		}
		case 'previous': {
			return Math.max(index - 1, 0);
		}
		case 'first': {
			return 0;
		}
		case 'last': {
			return last;
		}
		default: {
			return index;
		}
	}
}

/**
 * The index of the slide a URL hash such as `#4` names, counting slides from 1 as the hash does. A number past either
 * end gives the nearest slide, and an empty or unreadable hash gives the first.
 */
export function slideFromHash(hash: string, total: number): number {
	const match = /^#?(\d+)$/.exec(hash.trim());
	return match ? Math.min(Math.max(Number(match[1]) - 1, 0), Math.max(total - 1, 0)) : 0;
}

/** The URL hash for the slide at `index`, counting from 1. */
export function hashForSlide(index: number): string {
	return `#${index + 1}`;
}

/** The action a tap at `x` across a surface `width` wide asks for: Next on the right third, Previous on the left. */
export function tapAction(x: number, width: number): PresenterAction | undefined {
	if (width <= 0) return undefined;
	if (x >= (width * 2) / 3) return 'next';
	return x < width / 3 ? 'previous' : undefined;
}
