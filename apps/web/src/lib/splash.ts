import type { BootState } from '#lib/boot.svelte.ts';
import type { IsolationOutcome } from '#lib/cross-origin-isolation.ts';

export type SplashAction = 'reload' | 'copy-error' | 'open-in-new-tab';

/** What the splash shows for one state of startup. */
export type SplashView = {
	state: 'starting' | 'opening' | 'updating' | 'failed' | 'blocked';
	label: string;
	heading: string;
	text: string;
	/** The failure, shown in a code box above `text`. */
	error?: string;
	/** How much of the update is done, from 0 to 1. */
	progress?: number;
	actions: SplashAction[];
};

export const actionLabels: Record<SplashAction, string> = {
	reload: 'Reload',
	'copy-error': 'Copy error',
	'open-in-new-tab': 'Open in new tab'
};

/** Shown on the Copy error button for a moment after the error is copied. */
export const copiedLabel = 'Copied';

/**
 * How long the splash waits before it shows a state that is still in progress, so a database another tab or the landing
 * page already opened doesn't flash it. Failures show at once.
 */
export const splashDelay = 200;

const starting: SplashView = {
	state: 'starting',
	label: 'starting',
	heading: 'Getting ready',
	text: 'sld reloads once the first time it opens in this browser.',
	actions: []
};

const opening: SplashView = {
	state: 'opening',
	label: 'opening',
	heading: 'Opening your decks',
	text: 'Loading the decks saved in this browser.',
	actions: []
};

const blocked: SplashView = {
	state: 'blocked',
	label: "can't start",
	heading: "sld can't run in this window",
	text: "Something in this window blocks what sld needs, such as opening it inside another site or blocking this site's data. Open sld in its own tab. If that doesn't help, allow this site's data and reload.",
	actions: ['open-in-new-tab', 'reload']
};

/** Whether `view` is a failure, which shows at once and is announced as an alert. */
export function isFailure(view: SplashView): boolean {
	return view.state === 'failed' || view.state === 'blocked';
}

/** Whether the splash shows `view` now, given whether `splashDelay` has passed since `/app` mounted. */
export function shouldShowSplash(view: SplashView, hasDelayPassed: boolean): boolean {
	return hasDelayPassed || isFailure(view);
}

/** The splash for the isolation outcome and the boot state, or `undefined` once the database is ready. */
export function splashView(isolation: IsolationOutcome | 'checking', boot: BootState): SplashView | undefined {
	if (isolation === 'checking' || isolation === 'reloading') return starting;
	if (isolation === 'unavailable') return blocked;
	switch (boot.status) {
		case 'ready': {
			return undefined;
		}
		case 'failed': {
			return {
				state: 'failed',
				label: 'error',
				heading: "Your decks didn't open",
				text: 'Reload to try again. If it keeps happening, copy the error for a bug report.',
				error: boot.error,
				actions: ['reload', 'copy-error']
			};
		}
		case 'opening': {
			const { migrations } = boot;
			if (!migrations || migrations.total === 0) return opening;
			// `applied` counts finished migrations, so the step under way is the next one, until the last has finished.
			const step = Math.min(migrations.applied + 1, migrations.total);
			return {
				state: 'updating',
				label: `step ${step} of ${migrations.total}`,
				heading: 'Updating your decks',
				text: "sld has changed since your last visit, and it's updating your decks to match. Keep this tab open.",
				progress: Math.min(migrations.applied / migrations.total, 1),
				actions: []
			};
		}
	}
}
