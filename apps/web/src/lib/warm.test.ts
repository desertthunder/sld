import { describe, expect, it, vi } from 'vitest';
import { idleTimeout, whenIdle, type IdleScope } from '#lib/warm.ts';

function fakeScope({ readyState = 'loading', hasIdleCallback = true } = {}) {
	const listeners = new Set<() => void>();
	const idle = new Map<number, () => void>();
	const timers = new Map<number, () => void>();
	let next = 0;
	const scope: IdleScope = {
		document: { readyState: readyState as DocumentReadyState },
		addEventListener: (_type, listener) => void listeners.add(listener),
		removeEventListener: (_type, listener) => void listeners.delete(listener),
		setTimeout: (callback) => {
			timers.set(++next, callback);
			return next;
		},
		clearTimeout: (id) => void timers.delete(id as number),
		...(hasIdleCallback && {
			requestIdleCallback: vi.fn((callback: () => void) => {
				idle.set(++next, callback);
				return next;
			}),
			cancelIdleCallback: (id: number) => void idle.delete(id)
		})
	};
	const run = (queue: Map<number, () => void>) => {
		for (const [id, callback] of queue) {
			queue.delete(id);
			callback();
		}
	};
	return {
		scope,
		load: () => {
			for (const listener of listeners) listener();
			listeners.clear();
		},
		goIdle: () => run(idle),
		runTimers: () => run(timers),
		listeners
	};
}

describe('whenIdle', () => {
	it('waits for the page to load and then for the browser to go idle', () => {
		const { scope, load, goIdle } = fakeScope();
		const callback = vi.fn();
		whenIdle(callback, scope);
		goIdle();
		expect(callback).not.toHaveBeenCalled();
		load();
		expect(callback).not.toHaveBeenCalled();
		goIdle();
		expect(callback).toHaveBeenCalledOnce();
		expect(scope.requestIdleCallback).toHaveBeenCalledWith(callback, { timeout: idleTimeout });
	});

	it('waits only for idle when the page has already loaded', () => {
		const { scope, goIdle } = fakeScope({ readyState: 'complete' });
		const callback = vi.fn();
		whenIdle(callback, scope);
		goIdle();
		expect(callback).toHaveBeenCalledOnce();
	});

	it('runs in a task after loading where the browser has no idle callbacks', () => {
		const { scope, load, runTimers } = fakeScope({ hasIdleCallback: false });
		const callback = vi.fn();
		whenIdle(callback, scope);
		load();
		expect(callback).not.toHaveBeenCalled();
		runTimers();
		expect(callback).toHaveBeenCalledOnce();
	});

	it('cancels before the page has loaded', () => {
		const { scope, listeners } = fakeScope();
		const callback = vi.fn();
		whenIdle(callback, scope)();
		expect(listeners.size).toBe(0);
	});

	it('cancels while waiting for idle', () => {
		const { scope, load, goIdle } = fakeScope();
		const callback = vi.fn();
		const cancel = whenIdle(callback, scope);
		load();
		cancel();
		goIdle();
		expect(callback).not.toHaveBeenCalled();
	});

	it('cancels while waiting for the task', () => {
		const { scope, runTimers } = fakeScope({ readyState: 'complete', hasIdleCallback: false });
		const callback = vi.fn();
		whenIdle(callback, scope)();
		runTimers();
		expect(callback).not.toHaveBeenCalled();
	});
});
