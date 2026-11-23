<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import {
		createSlideState,
		cursorLabel,
		editorExtensions,
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

	const extensions = editorExtensions({
		change: (text) => onchange(shown.id, text),
		blur: () => onblur(),
		split: (parts) => onsplit(shown.id, parts),
		position: (label) => onposition(label)
	});

	function show(id: string, text: string, number: number) {
		const { view } = shown;
		if (!view) return;
		if (id !== shown.id) {
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

	// TODO: move the cursor to a warning's line when the warning strip under the editor asks to go to it.
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
