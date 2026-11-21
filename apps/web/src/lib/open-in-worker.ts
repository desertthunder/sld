import type { OpenFailedMessage } from '#lib/database.ts';
import { errorText } from '#lib/error-text.ts';

/** The parts of the worker's global scope that `openInWorker` uses. */
export type WorkerScope = {
	postMessage(message: OpenFailedMessage): void;
	addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
	removeEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
};

/**
 * Runs `open` inside the database worker and tells the tab, as plain text, when it fails. PGlite's worker drops an
 * error from its `init`, and PGlite drops a WebAssembly download that fails, so its open never settles and only an
 * unhandled rejection shows it. An unhandled rejection while opening therefore also counts as a failed open.
 *
 * After a failure the returned promise never settles: PGlite's worker awaits it for every tab that asks to connect,
 * and a rejection would be reported again each time. The tab stops the worker once it hears of the failure.
 */
export async function openInWorker<T>(open: () => Promise<T>, scope: WorkerScope): Promise<T> {
	const state = { hasFailed: false };
	const fail = (error: unknown) => {
		if (state.hasFailed) return;
		state.hasFailed = true;
		scope.postMessage({ type: 'open-failed', error: errorText(error) });
	};
	const onRejection = (event: PromiseRejectionEvent) => fail(event.reason);
	scope.addEventListener('unhandledrejection', onRejection);
	try {
		const database = await open();
		if (!state.hasFailed) return database;
	} catch (error) {
		fail(error);
	} finally {
		scope.removeEventListener('unhandledrejection', onRejection);
	}
	return new Promise<never>(() => {});
}
