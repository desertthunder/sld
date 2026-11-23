import { describe, expect, it } from 'vitest';
import { deckAspect, fitStage, stageSize } from '#lib/stage.ts';

describe('stageSize', () => {
	it('draws 16:9 decks at 1920 by 1080 and 4:3 decks at 1440 by 1080', () => {
		expect(stageSize('16:9')).toEqual({ width: 1920, height: 1080 });
		expect(stageSize('4:3')).toEqual({ width: 1440, height: 1080 });
	});
});

describe('deckAspect', () => {
	it('reads the aspects sld knows and falls back to 16:9 for any other', () => {
		expect(deckAspect('4:3')).toBe('4:3');
		expect(deckAspect('16:9')).toBe('16:9');
		expect(deckAspect('21:9')).toBe('16:9');
		expect(deckAspect('')).toBe('16:9');
	});
});

describe('fitStage', () => {
	const stage = stageSize('16:9');

	it('scales the stage to fill a container of the same aspect', () => {
		expect(fitStage(stage, { width: 320, height: 180 })).toEqual({ scale: 1 / 6, x: 0, y: 0 });
		expect(fitStage(stage, { width: 3840, height: 2160 })).toEqual({ scale: 2, x: 0, y: 0 });
	});

	it('centers the stage between bars at the sides of a container that is too wide', () => {
		expect(fitStage(stage, { width: 1000, height: 270 })).toEqual({ scale: 0.25, x: 260, y: 0 });
	});

	it('centers the stage between bars above and below in a container that is too tall', () => {
		expect(fitStage(stage, { width: 960, height: 1000 })).toEqual({ scale: 0.5, x: 0, y: 230 });
	});

	it('puts the stage on whole pixels', () => {
		const { x, y } = fitStage(stage, { width: 333, height: 401 });
		expect(Number.isSafeInteger(x) && Number.isSafeInteger(y)).toBe(true);
	});

	it('scales an unmeasured container to nothing', () => {
		expect(fitStage(stage, { width: 0, height: 0 }).scale).toBe(0);
	});
});
