import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	isolate,
	isolationHeaders,
	isolationWorkerUrl,
	reloadedKey,
	takeControlTimeout,
	type IsolationContext
} from '#lib/cross-origin-isolation.ts';

function fakeContext(overrides: Partial<IsolationContext> = {}) {
	const stored = new Map<string, string>();
	const listeners: (() => void)[] = [];
	const serviceWorker = {
		controller: undefined as unknown,
		register: vi.fn(async (): Promise<{ active: unknown }> => ({ active: undefined })),
		addEventListener: vi.fn((_type: string, listener: () => void) => {
			listeners.push(listener);
		})
	};
	const takeControl = () => {
		serviceWorker.controller = {};
		for (const listener of listeners) listener();
	};
	const context = {
		crossOriginIsolated: false,
		isSecureContext: true,
		serviceWorker,
		sessionStorage: {
			getItem: (key: string) => stored.get(key),
			setItem: (key: string, value: string) => void stored.set(key, value),
			removeItem: (key: string) => void stored.delete(key)
		},
		reload: vi.fn(),
		...overrides
	};
	return { context, serviceWorker, stored, takeControl };
}

function storageBlocked(overrides: Partial<IsolationContext>) {
	const { context } = fakeContext(overrides);
	Object.defineProperty(context, 'sessionStorage', {
		get: () => {
			throw new DOMException('Access is denied for this document.', 'SecurityError');
		}
	});
	return context;
}

describe('isolate', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('does nothing when the headers already isolate the page', async () => {
		const { context, serviceWorker } = fakeContext({ crossOriginIsolated: true });
		await expect(isolate(context)).resolves.toBe('isolated');
		expect(serviceWorker.register).not.toHaveBeenCalled();
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('registers the worker over the whole site and reloads once it takes control', async () => {
		const { context, serviceWorker, stored, takeControl } = fakeContext();
		const outcome = isolate(context);
		await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledWith(isolationWorkerUrl, { scope: '/' }));
		expect(context.reload).not.toHaveBeenCalled();
		takeControl();
		await expect(outcome).resolves.toBe('reloading');
		expect(context.reload).toHaveBeenCalledOnce();
		expect(stored.get(reloadedKey)).toBe('true');
	});

	it('reloads straight away when the worker already controls a page that is not isolated', async () => {
		const { context, serviceWorker } = fakeContext();
		serviceWorker.controller = {};
		await expect(isolate(context)).resolves.toBe('reloading');
		expect(context.reload).toHaveBeenCalledOnce();
	});

	it('reloads straight away when a hard reload bypassed the active worker', async () => {
		const { context, serviceWorker } = fakeContext();
		serviceWorker.register.mockResolvedValue({ active: {} });
		const outcome = isolate(context);
		await vi.advanceTimersByTimeAsync(takeControlTimeout);
		await expect(outcome).resolves.toBe('reloading');
		expect(context.reload).toHaveBeenCalledOnce();
	});

	it('does not reload a second time in the same tab session', async () => {
		const { context, serviceWorker, stored } = fakeContext();
		stored.set(reloadedKey, 'true');
		await expect(isolate(context)).resolves.toBe('unavailable');
		expect(serviceWorker.register).not.toHaveBeenCalled();
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('clears the reload guard once the page is isolated', async () => {
		const { context, stored } = fakeContext({ crossOriginIsolated: true });
		stored.set(reloadedKey, 'true');
		await isolate(context);
		expect(stored.has(reloadedKey)).toBe(false);
	});

	it('gives up when the worker never takes control', async () => {
		const { context } = fakeContext();
		const outcome = isolate(context);
		await vi.advanceTimersByTimeAsync(takeControlTimeout);
		await expect(outcome).resolves.toBe('unavailable');
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('gives up when registering the worker never settles', async () => {
		const { context, serviceWorker } = fakeContext();
		serviceWorker.register.mockReturnValue(new Promise(() => {}));
		const outcome = isolate(context);
		await vi.advanceTimersByTimeAsync(takeControlTimeout);
		await expect(outcome).resolves.toBe('unavailable');
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('gives up when the worker cannot be registered', async () => {
		const { context, serviceWorker } = fakeContext();
		serviceWorker.register.mockRejectedValue(new Error('The script failed to load'));
		await expect(isolate(context)).resolves.toBe('unavailable');
		expect(context.reload).not.toHaveBeenCalled();
	});

	it('still reports the outcome when the browser blocks site storage', async () => {
		await expect(isolate(storageBlocked({ crossOriginIsolated: true }))).resolves.toBe('isolated');
		await expect(isolate(storageBlocked({ crossOriginIsolated: false }))).resolves.toBe('unavailable');
	});

	it('gives up without service workers or a secure context', async () => {
		await expect(isolate(fakeContext({ serviceWorker: undefined }).context)).resolves.toBe('unavailable');
		await expect(isolate(fakeContext({ isSecureContext: false }).context)).resolves.toBe('unavailable');
	});
});

describe('static/_headers', () => {
	it('sends the isolation headers on every path', () => {
		const text = readFileSync(new URL('../../static/_headers', import.meta.url), 'utf8');
		const [path, ...lines] = text.trim().split('\n');
		expect(path).toBe('/*');
		const headers = Object.fromEntries(lines.map((line) => line.split(':').map((part) => part.trim())));
		expect(headers).toEqual(isolationHeaders);
	});
});
