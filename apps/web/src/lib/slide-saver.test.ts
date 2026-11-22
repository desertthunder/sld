import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlideSaver, type SaveStatus } from '#lib/slide-saver.ts';

describe('createSlideSaver', () => {
	let saved: [string, string][];
	let statuses: SaveStatus[];
	let save: (id: string, markdown: string) => Promise<unknown>;

	beforeEach(() => {
		vi.useFakeTimers();
		saved = [];
		statuses = [];
		save = async (id, markdown) => {
			saved.push([id, markdown]);
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function saver() {
		return createSlideSaver({
			save: (id, markdown) => save(id, markdown),
			onStatus: (status) => {
				statuses.push(status);
			},
			delay: 300
		});
	}

	it('writes an edit once typing pauses, and says saved only after the write', async () => {
		const slides = saver();
		slides.edit('a', '# O');
		await vi.advanceTimersByTimeAsync(200);
		slides.edit('a', '# On');
		await vi.advanceTimersByTimeAsync(200);
		expect(saved).toEqual([]);
		expect(slides.pending('a')).toBe('# On');
		expect(statuses).toEqual(['saving']);
		await vi.advanceTimersByTimeAsync(100);
		expect(saved).toEqual([['a', '# On']]);
		expect(slides.pending('a')).toBeUndefined();
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('flushes waiting edits at once', async () => {
		const slides = saver();
		slides.edit('a', '# A');
		slides.edit('b', '# B');
		await slides.flush();
		expect(saved).toEqual([
			['a', '# A'],
			['b', '# B']
		]);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('runs a write after the edits before it', async () => {
		const slides = saver();
		const order: string[] = [];
		save = async (id) => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			order.push(`save ${id}`);
		};
		slides.edit('a', '# A');
		const result = slides.run(async () => {
			order.push('delete');
			return 'done';
		});
		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toBe('done');
		expect(order).toEqual(['save a', 'delete']);
	});

	it('reports a failed write and keeps the edit to write again', async () => {
		const slides = saver();
		save = () => Promise.reject(new Error('IndexedDB is full'));
		slides.edit('a', '# A');
		await expect(slides.flush()).rejects.toThrow('IndexedDB is full');
		expect(statuses.at(-1)).toBe('failed');
		expect(slides.pending('a')).toBe('# A');
		save = async (id, markdown) => {
			saved.push([id, markdown]);
		};
		await slides.flush();
		expect(saved).toEqual([['a', '# A']]);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('keeps a newer edit over one whose write failed', async () => {
		const slides = saver();
		let fail!: (error: Error) => void;
		save = () => new Promise((_resolve, reject) => (fail = reject));
		slides.edit('a', '# Old');
		const flushed = slides.flush();
		await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
		slides.edit('a', '# New');
		fail(new Error('lost'));
		await expect(flushed).rejects.toThrow('lost');
		expect(slides.pending('a')).toBe('# New');
	});

	it('keeps an edit pending while its write runs', async () => {
		const slides = saver();
		let finish!: () => void;
		save = () => new Promise<void>((resolve) => (finish = resolve));
		slides.edit('a', '# A');
		const flushed = slides.flush();
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		expect(slides.pending('a')).toBe('# A');
		finish();
		await flushed;
		expect(slides.pending('a')).toBeUndefined();
	});

	it('skips a dropped run when its turn comes, leaving a failure reported', async () => {
		const slides = saver();
		const state = { isDropped: false };
		const ran: string[] = [];
		const failed = slides.run(async () => {
			state.isDropped = true;
			throw new Error('no');
		});
		const dropped = slides.run(
			async () => {
				ran.push('dropped');
			},
			() => state.isDropped
		);
		await expect(failed).rejects.toThrow('no');
		await expect(dropped).resolves.toBeUndefined();
		expect(ran).toEqual([]);
		expect(statuses).toEqual(['saving', 'failed']);
		await slides.run(async () => {
			ran.push('later');
		});
		expect(ran).toEqual(['later']);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('reports a dropped run as failed when the run before it succeeded', async () => {
		const slides = saver();
		const state = { isDropped: false };
		const ran: string[] = [];
		const succeeded = slides.run(async () => {
			state.isDropped = true;
		});
		const dropped = slides.run(
			async () => {
				ran.push('dropped');
			},
			() => state.isDropped
		);
		await succeeded;
		await expect(dropped).resolves.toBeUndefined();
		expect(ran).toEqual([]);
		expect(statuses).toEqual(['saving', 'failed']);
	});

	it('reports a failed run and rethrows it', async () => {
		const slides = saver();
		await expect(slides.run(() => Promise.reject(new Error('no')))).rejects.toThrow('no');
		expect(statuses).toEqual(['saving', 'failed']);
	});
});
