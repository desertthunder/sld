type WakeLockSentinelLike = Pick<WakeLockSentinel, 'release'>;

/** The parts of `navigator` the wake lock reads. `wakeLock` is missing in browsers without the Screen Wake Lock API. */
export type WakeLockNavigator = { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

/** The parts of `document` the wake lock and full screen read. */
export type ScreenDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/**
 * Keeps the screen on until the returned function stops it. Browsers release the lock when the tab is hidden, so it
 * asks again each time the tab becomes visible. A browser without the API, or one that refuses, such as when the
 * battery is low, leaves the screen to sleep as usual.
 */
export function keepScreenOn(navigator: WakeLockNavigator, document: ScreenDocument): () => void {
	const { wakeLock } = navigator;
	if (!wakeLock) return () => {};
	let sentinel: WakeLockSentinelLike | undefined;
	let isStopped = false;
	const request = async () => {
		try {
			const lock = await wakeLock.request('screen');
			if (isStopped) await lock.release();
			else sentinel = lock;
		} catch {
			// The screen may sleep, which is all a refusal costs.
		}
	};
	const onVisibilityChange = () => {
		if (document.visibilityState === 'visible') void request();
	};
	document.addEventListener('visibilitychange', onVisibilityChange);
	if (document.visibilityState === 'visible') void request();
	return () => {
		isStopped = true;
		document.removeEventListener('visibilitychange', onVisibilityChange);
		void sentinel?.release().catch(() => {});
		sentinel = undefined;
	};
}

/** The parts of `document` full screen reads. */
export type FullscreenDocument = Pick<Document, 'fullscreenElement' | 'exitFullscreen'> & {
	fullscreenEnabled?: boolean;
	documentElement: Pick<Element, 'requestFullscreen'>;
};

/** Whether the page is full screen. */
export function isFullscreen(document: Pick<Document, 'fullscreenElement'>): boolean {
	return document.fullscreenElement !== null && document.fullscreenElement !== undefined;
}

/**
 * Turns full screen on, or off when it is on. A browser without the Fullscreen API, such as Safari on iPhone, or one
 * that refuses, stays as it is.
 */
export async function toggleFullscreen(document: FullscreenDocument): Promise<void> {
	try {
		if (isFullscreen(document)) await document.exitFullscreen();
		else if (document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function') {
			await document.documentElement.requestFullscreen();
		}
	} catch {
		// A refused request leaves the page as it was.
	}
}

/** Leaves full screen, if the page is full screen. */
export async function exitFullscreen(document: FullscreenDocument): Promise<void> {
	if (!isFullscreen(document)) return;
	try {
		await document.exitFullscreen();
	} catch {
		// The page may already have left full screen.
	}
}
