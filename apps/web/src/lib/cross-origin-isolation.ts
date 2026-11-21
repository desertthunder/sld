/** What `static/_headers` and the Vite servers send on every path. */
export const isolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'credentialless'
} as const;

export const isolationWorkerUrl = '/isolation-worker.js';

export const reloadedKey = 'sld:isolation-reloaded';

/** How long to wait for the isolation worker to register and take control before giving up. */
export const takeControlTimeout = 10_000;

export type IsolationOutcome = 'isolated' | 'reloading' | 'unavailable';

/** The parts of the browser that `isolate` uses. */
export type IsolationContext = {
	crossOriginIsolated: boolean;
	isSecureContext: boolean;
	serviceWorker:
		| {
				controller: unknown;
				register(url: string, options: RegistrationOptions): Promise<unknown>;
				addEventListener(
					type: 'controllerchange',
					listener: () => void,
					options: AddEventListenerOptions
				): void;
		  }
		| undefined;
	sessionStorage: {
		getItem(key: string): unknown;
		setItem(key: string, value: string): void;
		removeItem(key: string): void;
	};
	reload(): void;
};

/**
 * Makes the page cross-origin isolated where the headers alone don't. Browsers that support
 * `Cross-Origin-Embedder-Policy: credentialless` are isolated by the headers. Others, such as Safari, are not; for them
 * this registers the isolation worker, which re-serves the site with `require-corp`, and reloads once it controls the
 * page. It reloads at most once per tab session, so a browser the worker can't isolate doesn't reload forever.
 */
export async function isolate(context: IsolationContext = browserContext()): Promise<IsolationOutcome> {
	if (context.crossOriginIsolated) {
		context.sessionStorage.removeItem(reloadedKey);
		return 'isolated';
	}
	const { serviceWorker } = context;
	if (!serviceWorker || !context.isSecureContext || context.sessionStorage.getItem(reloadedKey)) return 'unavailable';

	const timedOut = new Promise<false>((resolve) => setTimeout(() => resolve(false), takeControlTimeout));
	const tookControl = new Promise<true>((resolve) => {
		serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
	});
	const registered = (async () => {
		try {
			await serviceWorker.register(isolationWorkerUrl, { scope: '/' });
			return true;
		} catch {
			return false;
		}
	})();
	if (!(await Promise.race([registered, timedOut]))) return 'unavailable';
	// A page already under the worker's control but not isolated was loaded past it, as a hard reload does.
	if (!serviceWorker.controller && !(await Promise.race([tookControl, timedOut]))) return 'unavailable';
	context.sessionStorage.setItem(reloadedKey, 'true');
	context.reload();
	return 'reloading';
}

function browserContext(): IsolationContext {
	return {
		crossOriginIsolated,
		isSecureContext,
		serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
		sessionStorage,
		reload: () => location.reload()
	};
}
