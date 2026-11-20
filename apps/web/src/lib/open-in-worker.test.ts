import { describe, expect, it, vi } from 'vitest';
import { openInWorker, type WorkerScope } from '#lib/open-in-worker.ts';

class FakeScope extends EventTarget {
	postMessage = vi.fn();

	reject(reason: unknown) {
		this.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }));
	}
}

function asScope(fake: FakeScope): WorkerScope {
	return fake as unknown as WorkerScope;
}

async function isPending(promise: Promise<unknown>): Promise<boolean> {
	const state = { isSettled: false };
	const settle = async () => {
		try {
			await promise;
		} finally {
			state.isSettled = true;
		}
	};
	void settle().catch(() => {});
	await new Promise((resolve) => setTimeout(resolve, 20));
	return !state.isSettled;
}

describe('openInWorker', () => {
	it('returns the database once it opens', async () => {
		const scope = new FakeScope();
		await expect(openInWorker(async () => 'database', asScope(scope))).resolves.toBe('database');
		expect(scope.postMessage).not.toHaveBeenCalled();
	});

	it('reports an error that is not an Error instance as readable text', async () => {
		const scope = new FakeScope();
		const opening = openInWorker(() => Promise.reject({ name: 'ErrnoError', errno: 44 }), asScope(scope));
		await vi.waitFor(() =>
			expect(scope.postMessage).toHaveBeenCalledWith({ type: 'open-failed', error: 'ErrnoError (errno 44)' })
		);
		expect(await isPending(opening)).toBe(true);
	});

	it('reports a rejection PGlite drops while the open never settles', async () => {
		const scope = new FakeScope();
		const opening = openInWorker(() => new Promise<never>(() => {}), asScope(scope));
		scope.reject(new TypeError("Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok"));
		scope.reject(new TypeError('a second failure'));
		expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
			type: 'open-failed',
			error: "Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok"
		});
		expect(await isPending(opening)).toBe(true);
	});

	it('stops listening for unhandled rejections once the database is open', async () => {
		const scope = new FakeScope();
		await openInWorker(async () => 'database', asScope(scope));
		scope.reject(new Error('unrelated'));
		expect(scope.postMessage).not.toHaveBeenCalled();
	});
});
