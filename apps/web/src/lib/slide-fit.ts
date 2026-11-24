/** A slide's text scale, `--fit`, and whether its content fits above the bottom margin at that scale. */
export type Fitted = { fit: number; doesFit: boolean };

/**
 * The smallest `--fit` worth trying: where the title layout's 136px heading reaches the 72px heading floor, the last
 * text on a slide to stop shrinking. Below it nothing gets smaller.
 */
export const minFit = 72 / 136;

/** The smallest `--code-fit` a code block takes for a long line: 30px code down to 20px. */
export const minCodeFit = 20 / 30;

const steps = 7;

/**
 * The events, caught on their way down to a slide's elements, after which the slide can take a new height without its
 * HTML changing: an image or frame loading, a video learning its size, and a disclosure opening or closing.
 */
export const sizeEvents = ['load', 'loadedmetadata', 'toggle'] as const;

/**
 * The largest scale between `min` and 1 at which `doesFit` holds, assuming a smaller scale never fits worse. Tries 1
 * first, then `min`, then halves the gap `steps` times, so the answer is within 1% of the best. When nothing fits, it
 * returns `min`.
 */
export function largestFit(doesFit: (scale: number) => boolean, min: number): Fitted {
	if (doesFit(1)) return { fit: 1, doesFit: true };
	if (!doesFit(min)) return { fit: min, doesFit: false };
	let low = min;
	let high = 1;
	for (let step = 0; step < steps; step++) {
		const middle = (low + high) / 2;
		if (doesFit(middle)) low = middle;
		else high = middle;
	}
	return { fit: low, doesFit: true };
}

/**
 * Whether `child` is the title layout's last line, which `slide.css` pins to the bottom margin out of the flow, so the
 * content above it can run underneath without reaching the margin.
 */
function isPinned(child: HTMLElement): boolean {
	return child.matches('.layout-title > p') && getComputedStyle(child).position === 'absolute';
}

/**
 * The bottom edge of a slide's lowest child, in stage pixels from the slide's top. The slide is its children's offset
 * parent, so a transform on the stage changes nothing. A child that isn't HTML, such as an inline SVG, is measured on
 * screen and scaled back, and counts for nothing while the stage has no size. The title layout's pinned last line
 * counts as if it sat under the rest, a block gap apart, so content that would run into it doesn't fit.
 */
export function contentBottom(slide: HTMLElement): number {
	let bottom = 0;
	let pinned = 0;
	let scale: number | undefined;
	for (const child of slide.children) {
		if (child instanceof HTMLElement) {
			if (child.offsetHeight > 0 && isPinned(child)) {
				// eslint-disable-next-line unicorn/prefer-number-coercion -- The computed margin ends in px, which Number() rejects.
				pinned = Number.parseFloat(getComputedStyle(child).marginTop) + child.offsetHeight;
				continue;
			}
			bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
			continue;
		}
		scale ??= slide.getBoundingClientRect().height / slide.offsetHeight;
		if (!(scale > 0)) continue;
		const top = slide.getBoundingClientRect().top;
		bottom = Math.max(bottom, (child.getBoundingClientRect().bottom - top) / scale);
	}
	return pinned > 0 ? Math.max(bottom + pinned, slide.clientHeight - paddingBottom(slide)) : bottom;
}

function paddingBottom(element: HTMLElement): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- The computed padding ends in px, which Number() rejects.
	return Number.parseFloat(getComputedStyle(element).paddingBottom);
}

/** Whether a slide's content ends above its bottom margin. Half a pixel absorbs rounding. */
export function doesSlideFit(slide: HTMLElement): boolean {
	return contentBottom(slide) <= slide.clientHeight - paddingBottom(slide) + 0.5;
}

function isCodeClipped(block: HTMLElement): boolean {
	if (block.scrollWidth > block.clientWidth) return true;
	const labeled = block.querySelector<HTMLElement>('.line:has(> .line-code)');
	return labeled !== null && labeled.scrollHeight > labeled.clientHeight;
}

function setScale(element: HTMLElement, name: string, scale: number) {
	const value = scale === 1 ? '' : String(scale);
	if (element.style.getPropertyValue(name) === value) return;
	if (value === '') element.style.removeProperty(name);
	else element.style.setProperty(name, value);
}

/**
 * Shrinks a slide's text until it fits above the bottom margin, down to the floors in `slide.css`. First each code
 * block with a line too long for it shrinks its own code, down to 20px. Then the whole slide takes the largest `--fit`
 * that fits. It writes only the two custom properties, and leaves a slide that fits at full size untouched.
 */
export function fitSlide(slide: HTMLElement): Fitted {
	setScale(slide, '--fit', 1);
	for (const block of slide.querySelectorAll<HTMLElement>('pre.code-block')) {
		setScale(block, '--code-fit', 1);
		if (!isCodeClipped(block)) continue;
		const { fit } = largestFit((scale) => {
			setScale(block, '--code-fit', scale);
			return !isCodeClipped(block);
		}, minCodeFit);
		setScale(block, '--code-fit', fit);
	}
	const fitted = largestFit((scale) => {
		setScale(slide, '--fit', scale);
		return doesSlideFit(slide);
	}, minFit);
	setScale(slide, '--fit', fitted.fit);
	return fitted;
}
