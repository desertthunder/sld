<script lang="ts">
	let {
		label,
		value,
		min,
		max,
		valueText,
		controls,
		onstep,
		ondrag,
		ondone,
		onreset
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		valueText: string;
		controls: string;
		/** A key press: one step smaller or larger, or all the way to an end. */
		onstep: (step: -1 | 1 | 'min' | 'max') => void;
		/** The pointer moved to `clientX` while dragging. */
		ondrag: (clientX: number) => void;
		/** A drag ended or a key changed the width. */
		ondone: () => void;
		onreset: () => void;
	} = $props();

	const drag = $state({ isDragging: false });

	const steps: Record<string, -1 | 1 | 'min' | 'max'> = { ArrowLeft: -1, ArrowRight: 1, Home: 'min', End: 'max' };

	function onkeydown(event: KeyboardEvent) {
		const step = steps[event.key];
		if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		onstep(step);
		ondone();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag.isDragging = true;
	}

	function onpointermove(event: PointerEvent) {
		if (drag.isDragging) ondrag(event.clientX);
	}

	function stop() {
		if (!drag.isDragging) return;
		drag.isDragging = false;
		ondone();
	}
</script>

<!-- A focusable separator with a value is a widget in ARIA, which Svelte's checks don't know. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="handle"
	class:dragging={drag.isDragging}
	role="separator"
	tabindex="0"
	aria-label={label}
	aria-orientation="vertical"
	aria-valuenow={value}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuetext={valueText}
	aria-controls={controls}
	{onkeydown}
	{onpointerdown}
	{onpointermove}
	onpointerup={stop}
	onpointercancel={stop}
	ondblclick={onreset}>
</div>

<style>
	.handle {
		position: relative;
		background: var(--background);
		cursor: col-resize;
		touch-action: none;
		user-select: none;
	}

	.handle::after {
		content: '';
		position: absolute;
		left: 2px;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border);
	}

	.handle:hover::after,
	.handle:focus-visible::after,
	.dragging::after {
		left: 1px;
		width: 3px;
		background: var(--accent);
	}

	.handle:focus-visible {
		outline: none;
	}

	.handle:focus-visible::before {
		content: '';
		position: absolute;
		inset: 0 -2px;
		border-radius: 3px;
		box-shadow: 0 0 0 2px var(--accent);
	}
</style>
