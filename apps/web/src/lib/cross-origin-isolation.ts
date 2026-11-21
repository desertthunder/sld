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
				register(url: string, options: RegistrationOptions): Promise<{ active: unknown }>;
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
	try {
		return await isolateWithWorker(context);
	} catch {
		// Reading `sessionStorage` throws where the browser blocks site storage.
		return context.crossOriginIsolated ? 'isolated' : 'unavailable';
	}
}

async function isolateWithWorker(context: IsolationContext): Promise<IsolationOutcome> {
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
			return await serviceWorker.register(isolationWorkerUrl, { scope: '/' });
		} catch {
			return false;
		}
	})();
	const registration = await Promise.race([registered, timedOut]);
	if (!registration) return 'unavailable';
	// A hard reload bypasses an active worker, so the page loads without a controller and no `controllerchange` follows.
	const active = serviceWorker.controller || registration.active;
	if (!active && !(await Promise.race([tookControl, timedOut]))) return 'unavailable';
	context.sessionStorage.setItem(reloadedKey, 'true');
	context.reload();
	return 'reloading';
}

function browserContext(): IsolationContext {
	return {
		// Safari before 15.2 has no `crossOriginIsolated` global.
		crossOriginIsolated: typeof crossOriginIsolated === 'boolean' && crossOriginIsolated,
		isSecureContext,
		serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
		get sessionStorage() {
			return sessionStorage;
		},
		reload: () => location.reload()
	};
}
