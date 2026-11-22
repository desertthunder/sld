import type { Database } from '#lib/database.ts';
import type { MigrationProgress } from '#lib/migrate.ts';

/** The parts of the browser that `whenIdle` uses. `requestIdleCallback` is missing in Safari. */
export type IdleScope = {
	document: Pick<Document, 'readyState'>;
	addEventListener(type: 'load', listener: () => void, options: AddEventListenerOptions): void;
	removeEventListener(type: 'load', listener: () => void): void;
	setTimeout(callback: () => void, delay: number): unknown;
	clearTimeout(id: unknown): void;
	requestIdleCallback?(callback: () => void, options: IdleRequestOptions): number;
	cancelIdleCallback?(id: number): void;
};

/** How long `whenIdle` waits for the browser to go idle after the page has loaded, in milliseconds. */
export const idleTimeout = 2000;

/**
 * Calls `callback` once the page has loaded and the browser is idle, or `idleTimeout` after loading at the latest, so
 * work started there doesn't hold up the page's first paint. The returned function cancels the call.
 */
export function whenIdle(callback: () => void, scope: IdleScope = globalThis as unknown as IdleScope): () => void {
	const state: { cancel?: () => void } = {};
	const idle = () => {
		if (scope.requestIdleCallback && scope.cancelIdleCallback) {
			const id = scope.requestIdleCallback(callback, { timeout: idleTimeout });
			const cancelIdle = scope.cancelIdleCallback.bind(scope);
			state.cancel = () => cancelIdle(id);
		} else {
			const id = scope.setTimeout(callback, 0);
			state.cancel = () => scope.clearTimeout(id);
		}
	};
	if (scope.document.readyState === 'complete') {
		idle();
	} else {
		scope.addEventListener('load', idle, { once: true });
		state.cancel = () => scope.removeEventListener('load', idle);
	}
	return () => state.cancel?.();
}

/**
 * Opens the deck database for `startBoot`, loading the database module only when called, so a page that imports this
 * doesn't bundle PGlite.
 */
export async function openDecks(
	lost: (error: unknown) => void,
	progress: (migrations: MigrationProgress) => void
): Promise<Database> {
	const { openDatabase } = await import('#lib/database.ts');
	return openDatabase(lost, progress);
}
