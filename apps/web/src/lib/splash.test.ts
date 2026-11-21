import { describe, expect, it } from 'vitest';
import { actionLabels, isFailure, shouldShowSplash, splashView, type SplashView } from '#lib/splash.ts';

const opening = { status: 'opening' } as const;

function copyOf(view: SplashView | undefined) {
	if (!view) throw new Error('No splash');
	return {
		label: view.label,
		heading: view.heading,
		error: view.error,
		text: view.text,
		buttons: view.actions.map((action) => actionLabels[action])
	};
}

describe('splashView', () => {
	it('shows Starting while the browser is checked or reloads to be isolated', () => {
		const starting = {
			label: 'starting',
			heading: 'Getting ready',
			error: undefined,
			text: 'sld reloads once the first time it opens in this browser.',
			buttons: []
		};
		expect(copyOf(splashView('checking', opening))).toEqual(starting);
		expect(copyOf(splashView('reloading', opening))).toEqual(starting);
	});

	it("shows Can't run when the page can't be isolated, whatever the database does", () => {
		const blocked = {
			label: "can't start",
			heading: "sld can't run in this window",
			error: undefined,
			text: "Something in this window blocks what sld needs, such as opening it inside another site or blocking this site's data. Open sld in its own tab. If that doesn't help, allow this site's data and reload.",
			buttons: ['Open in new tab', 'Reload']
		};
		expect(copyOf(splashView('unavailable', opening))).toEqual(blocked);
		expect(copyOf(splashView('unavailable', { status: 'ready' }))).toEqual(blocked);
	});

	it('shows Opening while the database opens', () => {
		expect(copyOf(splashView('isolated', opening))).toEqual({
			label: 'opening',
			heading: 'Opening your decks',
			error: undefined,
			text: 'Loading the decks saved in this browser.',
			buttons: []
		});
		expect(splashView('isolated', { status: 'opening', migrations: { applied: 0, total: 0 } })?.state).toBe(
			'opening'
		);
	});

	it('shows Updating with the migration under way as the step', () => {
		const view = splashView('isolated', { status: 'opening', migrations: { applied: 0, total: 3 } });
		expect(copyOf(view)).toEqual({
			label: 'step 1 of 3',
			heading: 'Updating your decks',
			error: undefined,
			text: "sld has changed since your last visit, and it's updating your decks to match. Keep this tab open.",
			buttons: []
		});
		expect(view?.progress).toBe(0);
	});

	it('never counts past the last step once every migration is applied', () => {
		const labels = [0, 1, 2, 3].map(
			(applied) => splashView('isolated', { status: 'opening', migrations: { applied, total: 3 } })?.label
		);
		expect(labels).toEqual(['step 1 of 3', 'step 2 of 3', 'step 3 of 3', 'step 3 of 3']);
		expect(splashView('isolated', { status: 'opening', migrations: { applied: 3, total: 3 } })?.progress).toBe(1);
	});

	it('shows Failed with the error text', () => {
		expect(
			copyOf(splashView('isolated', { status: 'failed', error: 'Invalid FS bundle size: 9 !== 6241295' }))
		).toEqual({
			label: 'error',
			heading: "Your decks didn't open",
			error: 'Invalid FS bundle size: 9 !== 6241295',
			text: 'Reload to try again. If it keeps happening, copy the error for a bug report.',
			buttons: ['Reload', 'Copy error']
		});
	});

	it('leaves once the database is ready', () => {
		expect(splashView('isolated', { status: 'ready' })).toBeUndefined();
	});
});

describe('isFailure', () => {
	it("is true for Failed and Can't run only", () => {
		const failures = (
			[
				['checking', opening],
				['unavailable', opening],
				['isolated', opening],
				['isolated', { status: 'opening', migrations: { applied: 1, total: 2 } }],
				['isolated', { status: 'failed', error: 'x' }]
			] as const
		).map(([isolation, boot]) => {
			const view = splashView(isolation, boot);
			return view && isFailure(view);
		});
		expect(failures).toEqual([false, true, false, false, true]);
	});
});

describe('shouldShowSplash', () => {
	const views = (
		[
			['checking', opening],
			['isolated', opening],
			['isolated', { status: 'opening', migrations: { applied: 1, total: 2 } }],
			['unavailable', opening],
			['isolated', { status: 'failed', error: 'x' }]
		] as const
	).map(([isolation, boot]) => {
		const view = splashView(isolation, boot);
		if (!view) throw new Error('No splash');
		return view;
	});

	it('waits for the delay before it shows a state in progress, so a warm database shows no splash', () => {
		expect(views.map((view) => shouldShowSplash(view, false))).toEqual([false, false, false, true, true]);
	});

	it('shows every state once the delay has passed', () => {
		expect(views.map((view) => shouldShowSplash(view, true))).toEqual([true, true, true, true, true]);
	});
});
