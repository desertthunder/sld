import { describe, expect, it } from 'vitest';
import { largestFit, minCodeFit, minFit } from '#lib/slide-fit.ts';

describe('largestFit', () => {
	it('keeps full size, trying nothing else, when the slide fits', () => {
		const tried: number[] = [];
		const doesFit = (scale: number) => {
			tried.push(scale);
			return true;
		};
		expect(largestFit(doesFit, minFit)).toEqual({ fit: 1, doesFit: true });
		expect(tried).toEqual([1]);
	});

	it('stops at the floor and says the slide does not fit when nothing does', () => {
		expect(largestFit(() => false, minFit)).toEqual({ fit: minFit, doesFit: false });
	});

	it('finds the largest scale that fits to within 1%, in a handful of tries', () => {
		const tried: number[] = [];
		const doesFit = (scale: number) => {
			tried.push(scale);
			return scale <= 0.82;
		};
		const fitted = largestFit(doesFit, minFit);
		expect(fitted.doesFit).toBe(true);
		expect(fitted.fit).toBeLessThanOrEqual(0.82);
		expect(fitted.fit).toBeGreaterThan(0.81);
		expect(tried.length).toBeLessThanOrEqual(9);
	});

	it('stops shrinking where the last text reaches its floor', () => {
		expect(136 * minFit).toBeCloseTo(72);
		expect(30 * minCodeFit).toBeCloseTo(20);
	});
});
