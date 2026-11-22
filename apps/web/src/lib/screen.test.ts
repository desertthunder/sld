import { describe, expect, it, vi } from 'vitest';
import {
	exitFullscreen,
	keepScreenOn,
	toggleFullscreen,
	type FullscreenDocument,
	type ScreenDocument
} from '#lib/screen.ts';

function fakeDocument(visibilityState: DocumentVisibilityState = 'visible') {
	const target = new EventTarget();
	const document = {
		visibilityState,
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target)
	};
	const show = (state: DocumentVisibilityState) => {
		document.visibilityState = state;
		target.dispatchEvent(new Event('visibilitychange'));
	};
	return { document: document as ScreenDocument, show };
}

function fakeWakeLock() {
	const released = vi.fn(async () => {});
	const request = vi.fn(async (type: 'screen') => ({ type, release: released }));
	return { navigator: { wakeLock: { request } }, request, released };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('keepScreenOn', () => {
	it('asks for a screen wake lock and releases it when stopped', async () => {
		const { navigator, request, released } = fakeWakeLock();
		const { document } = fakeDocument();
		const stop = keepScreenOn(navigator, document);
		await settle();
		expect(request).toHaveBeenCalledWith('screen');
		stop();
		expect(released).toHaveBeenCalledOnce();
	});

	it('asks again each time the tab becomes visible, and not once stopped', async () => {
		const { navigator, request } = fakeWakeLock();
		const { document, show } = fakeDocument();
		const stop = keepScreenOn(navigator, document);
		show('hidden');
		show('visible');
		await settle();
		expect(request).toHaveBeenCalledTimes(2);
		stop();
		show('visible');
		expect(request).toHaveBeenCalledTimes(2);
	});

	it('waits for a hidden tab to become visible before asking', async () => {
		const { navigator, request } = fakeWakeLock();
		const { document, show } = fakeDocument('hidden');
		keepScreenOn(navigator, document);
		expect(request).not.toHaveBeenCalled();
		show('visible');
		expect(request).toHaveBeenCalledOnce();
	});

	it('does nothing in a browser without the Screen Wake Lock API', () => {
		const { document, show } = fakeDocument();
		const stop = keepScreenOn({}, document);
		show('visible');
		expect(() => stop()).not.toThrow();
	});

	it('carries on when the browser refuses the lock', async () => {
		const { document } = fakeDocument();
		const request = vi.fn(() => Promise.reject(new DOMException('Low battery', 'NotAllowedError')));
		const stop = keepScreenOn({ wakeLock: { request } }, document);
		await settle();
		expect(request).toHaveBeenCalledOnce();
		expect(() => stop()).not.toThrow();
	});

	it('releases a lock that arrives after it was stopped', async () => {
		const { navigator, released } = fakeWakeLock();
		const { document } = fakeDocument();
		keepScreenOn(navigator, document)();
		await settle();
		expect(released).toHaveBeenCalledOnce();
	});
});

// The Fullscreen API reports a page that isn't full screen with null.
/* eslint-disable unicorn/no-null */
function fakeFullscreen({ enabled = true, refuses = false } = {}) {
	const document = {
		fullscreenElement: null as Element | null,
		fullscreenEnabled: enabled,
		exitFullscreen: vi.fn(async () => {
			document.fullscreenElement = null;
		}),
		documentElement: {
			requestFullscreen: vi.fn(async () => {
				if (refuses) throw new TypeError('Permissions check failed');
				document.fullscreenElement = {} as Element;
			})
		}
	};
	return document;
}
/* eslint-enable unicorn/no-null */

describe('toggleFullscreen', () => {
	it('turns full screen on, then off', async () => {
		const document = fakeFullscreen();
		await toggleFullscreen(document as unknown as FullscreenDocument);
		expect(document.fullscreenElement).not.toBeNull();
		await toggleFullscreen(document as unknown as FullscreenDocument);
		expect(document.fullscreenElement).toBeNull();
	});

	it('stays as it is in a browser without full screen, or one that refuses', async () => {
		const disabled = fakeFullscreen({ enabled: false });
		await toggleFullscreen(disabled as unknown as FullscreenDocument);
		expect(disabled.documentElement.requestFullscreen).not.toHaveBeenCalled();
		const refusing = fakeFullscreen({ refuses: true });
		await expect(toggleFullscreen(refusing as unknown as FullscreenDocument)).resolves.toBeUndefined();
		expect(refusing.fullscreenElement).toBeNull();
	});
});

describe('exitFullscreen', () => {
	it('leaves full screen only when the page is full screen', async () => {
		const document = fakeFullscreen();
		await exitFullscreen(document as unknown as FullscreenDocument);
		expect(document.exitFullscreen).not.toHaveBeenCalled();
		document.fullscreenElement = {} as Element;
		await exitFullscreen(document as unknown as FullscreenDocument);
		expect(document.fullscreenElement).toBeNull();
	});
});
