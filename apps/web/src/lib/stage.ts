/** A deck's aspect ratio, as its frontmatter's `aspect` field names it. */
export type Aspect = '16:9' | '4:3';

/** A size in pixels. */
export type Size = { width: number; height: number };

/** Where a stage sits in its container: its scale, and the offset of its top left corner in container pixels. */
export type Fit = { scale: number; x: number; y: number };

/** The aspect a deck gets when its frontmatter names none. */
export const defaultAspect: Aspect = '16:9';

const stageSizes: Record<Aspect, Size> = {
	'16:9': { width: 1920, height: 1080 },
	'4:3': { width: 1440, height: 1080 }
};

/** The logical size slides draw at for an aspect. Slide CSS uses these pixels. */
export function stageSize(aspect: Aspect): Size {
	return stageSizes[aspect];
}

/**
 * Scales a stage to fit inside its container and centers it, leaving bars on two sides when the aspects differ. The
 * offset is rounded to whole pixels, since a stage that starts between pixels draws its text blurred in some browsers.
 */
export function fitStage(stage: Size, container: Size): Fit {
	const scale = Math.max(0, Math.min(container.width / stage.width, container.height / stage.height));
	return {
		scale,
		x: Math.round((container.width - stage.width * scale) / 2),
		y: Math.round((container.height - stage.height * scale) / 2)
	};
}
