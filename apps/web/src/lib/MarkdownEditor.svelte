<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import {
		createSlideState,
		cursorLabel,
		editorExtensions,
		goToLine as goToLineSpec,
		hold as holdSpec,
		holdAtEnd,
		syncSlideState,
		type SplitParts
	} from '#lib/markdown-editor.ts';

	let {
		slideId,
		markdown,
		slideNumber,
		onchange,
		onblur,
		onsplit,
		onposition
	}: {
		slideId: string;
		markdown: string;
		/** The slide's number in the deck, counted from 1. */
		slideNumber: number;
		onchange: (id: string, markdown: string) => void;
		onblur: () => void;
		onsplit: (id: string, parts: SplitParts) => void;
		onposition: (label: string) => void;
	} = $props();

	let host: HTMLDivElement;
	// Each slide keeps its own state while the deck is open, so its undo history survives switching slides.
	const shown: { view?: EditorView; id: string; states: Map<string, EditorState> } = { id: '', states: new Map() };

	const hintId = $props.id();
	const status = $state({ isHeld: false, hint: '' });
	const extensions = [
		editorExtensions({
			change: (text) => onchange(shown.id, text),
			blur: () => onblur(),
			split: (parts) => onsplit(shown.id, parts),
			position: (label) => onposition(label),
			held: (isHeld) => (status.isHeld = isHeld)
		}),
		EditorView.contentAttributes.of({ 'aria-describedby': hintId })
	];

	function show(id: string, text: string, number: number) {
		const { view } = shown;
		if (!view) return;
		if (id !== shown.id) {
			if (status.isHeld) view.dispatch(holdSpec(false));
			shown.states.set(shown.id, view.state);
			const isFocused = view.hasFocus;
			view.setState(shown.states.get(id) ?? createSlideState(text, number, extensions));
			shown.id = id;
			if (isFocused) view.focus();
		}
		const update = syncSlideState(view.state, text, number);
		if (update) view.dispatch(update);
		onposition(cursorLabel(view.state));
	}

	/**
	 * Holds the slide shown read-only while the editor has focus, until a click, a focus from elsewhere or Escape lets
	 * it go, so keys meant for a slide that just went away don't edit this one, and shows `hint` while it holds. Returns
	 * whether it held it.
	 */
	export function didHold(hint: string): boolean {
		const { view } = shown;
		if (!view?.hasFocus) return false;
		status.hint = hint;
		view.dispatch(holdAtEnd(view.state));
		return true;
	}

	/** Moves the cursor to line `number` of the slide shown, scrolls to it and focuses the editor. */
	export function goToLine(number: number) {
		const { view } = shown;
		if (!view) return;
		view.dispatch(goToLineSpec(view.state, number));
		view.focus();
	}

	onMount(() => {
		shown.id = slideId;
		shown.view = new EditorView({ parent: host, state: createSlideState(markdown, slideNumber, extensions) });
		onposition(cursorLabel(shown.view.state));
		return () => {
			shown.view?.destroy();
			shown.view = undefined;
		};
	});

	$effect(() => {
		const id = slideId;
		const text = markdown;
		const number = slideNumber;
		untrack(() => show(id, text, number));
	});
</script>

<div class="markdown-editor" bind:this={host}></div>
<p class="hint" class:held={status.isHeld} id={hintId}>
	{status.isHeld ? status.hint : 'Esc then Tab leaves the editor'}
</p>

<style>
	.markdown-editor {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		--marks: color-mix(in oklab, var(--base04) 62%, var(--base00));
		--curline: color-mix(in oklab, var(--base01) 55%, var(--base00));
		--fmband: color-mix(in oklab, var(--base01) 70%, var(--base00));
	}

	.markdown-editor > :global(.cm-editor) {
		flex: 1;
		min-height: 0;
	}

	.hint {
		flex: none;
		margin: 0;
		padding: 8px 16px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--muted);
	}

	.hint.held {
		color: var(--heading);
		font-weight: 600;
	}

	.markdown-editor > :global(.cm-editor:has(.cm-content:focus-visible)) {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}

	@media (prefers-color-scheme: light) {
		.markdown-editor {
			--marks: color-mix(in oklab, var(--base04) 88%, var(--base00));
		}
	}
</style>
