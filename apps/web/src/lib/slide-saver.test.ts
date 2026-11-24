import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlideSaver, type SaveStatus, type SaverEntry } from '#lib/slide-saver.ts';

describe('createSlideSaver', () => {
	let batches: SaverEntry<string>[][];
	let statuses: SaveStatus[];
	let commit: (entries: SaverEntry<string>[]) => Promise<boolean>;

	beforeEach(() => {
		vi.useFakeTimers();
		batches = [];
		statuses = [];
		commit = async (entries) => {
			batches.push(entries);
			return true;
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function saver() {
		return createSlideSaver<string>({
			commit: (entries) => commit(entries),
			onStatus: (status) => {
				statuses.push(status);
			},
			delay: 300
		});
	}

	const edit = (id: string, markdown: string): SaverEntry<string> => ({ kind: 'edit', id, markdown });
	const change = (name: string): SaverEntry<string> => ({ kind: 'change', change: name });

	it('writes an edit once typing pauses, and says saved only after the write', async () => {
		const slides = saver();
		slides.edit('a', '# O');
		await vi.advanceTimersByTimeAsync(200);
		slides.edit('a', '# On');
		await vi.advanceTimersByTimeAsync(200);
		expect(batches).toEqual([]);
		expect(slides.pending('a')).toBe('# On');
		expect(statuses).toEqual(['saving']);
		await vi.advanceTimersByTimeAsync(100);
		expect(batches).toEqual([[edit('a', '# On')]]);
		expect(slides.pending('a')).toBeUndefined();
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('flushes waiting edits at once, in one batch', async () => {
		const slides = saver();
		slides.edit('a', '# A');
		slides.edit('b', '# B');
		await slides.flush();
		expect(batches).toEqual([[edit('a', '# A'), edit('b', '# B')]]);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('writes a change after the edits before it, in the same batch', async () => {
		const slides = saver();
		slides.edit('a', '# A');
		await slides.change('delete');
		expect(batches).toEqual([[edit('a', '# A'), change('delete')]]);
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('writes everything queued while a batch is written as the next batch, in order', async () => {
		const slides = saver();
		let finish!: () => void;
		commit = async (entries) => {
			batches.push(entries);
			if (batches.length === 1) await new Promise<void>((resolve) => (finish = resolve));
			return true;
		};
		const first = slides.change('add 1');
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		const later = [slides.change('add 2'), slides.change('add 3')];
		slides.edit('a', '# A');
		const last = slides.change('add 4');
		expect(slides.pending('a')).toBe('# A');
		finish();
		await Promise.all([first, ...later, last]);
		expect(batches).toEqual([
			[change('add 1')],
			[change('add 2'), change('add 3'), edit('a', '# A'), change('add 4')]
		]);
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('reports a failed batch, and keeps its edits to write again', async () => {
		const slides = saver();
		commit = () => Promise.reject(new Error('IndexedDB is full'));
		slides.edit('a', '# A');
		await slides.change('add');
		expect(statuses.at(-1)).toBe('failed');
		expect(slides.pending('a')).toBe('# A');
		commit = async (entries) => {
			batches.push(entries);
			return true;
		};
		await slides.flush();
		expect(batches).toEqual([[edit('a', '# A')]]);
		expect(statuses.at(-1)).toBe('saved');
	});

	it('drops a batch that could not all be stored, and reports it as not saved', async () => {
		const slides = saver();
		commit = async (entries) => {
			batches.push(entries);
			return false;
		};
		slides.edit('gone', '# Lost');
		await slides.flush();
		expect(slides.pending('gone')).toBeUndefined();
		expect(statuses.at(-1)).toBe('failed');
		await slides.flush();
		expect(batches).toHaveLength(1);
		expect(statuses.at(-1)).toBe('failed');
	});

	it('keeps a newer edit over one whose batch failed', async () => {
		const slides = saver();
		let fail!: (error: Error) => void;
		commit = () => new Promise((_resolve, reject) => (fail = reject));
		slides.edit('a', '# Old');
		const flushed = slides.flush();
		await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
		slides.edit('a', '# New');
		fail(new Error('lost'));
		await flushed;
		expect(slides.pending('a')).toBe('# New');
	});

	it('keeps an edit pending while its batch is written', async () => {
		const slides = saver();
		let finish!: (isStored: boolean) => void;
		commit = () => new Promise<boolean>((resolve) => (finish = resolve));
		slides.edit('a', '# A');
		const flushed = slides.flush();
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		expect(slides.pending('a')).toBe('# A');
		expect(statuses).toEqual(['saving']);
		finish(true);
		await flushed;
		expect(slides.pending('a')).toBeUndefined();
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('says saving while a batch after a failed one is written, and saved once it is stored', async () => {
		const slides = saver();
		commit = () => Promise.reject(new Error('no'));
		await slides.change('add');
		expect(statuses).toEqual(['saving', 'failed']);
		slides.edit('a', '# A');
		expect(statuses).toEqual(['saving', 'failed']);
		let finish!: (isStored: boolean) => void;
		commit = (entries) => {
			batches.push(entries);
			return new Promise<boolean>((resolve) => (finish = resolve));
		};
		const added = slides.change('add again');
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		expect(statuses).toEqual(['saving', 'failed', 'saving']);
		finish(true);
		await added;
		expect(batches).toEqual([[edit('a', '# A'), change('add again')]]);
		expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved']);
	});

	it('resolves a flush with nothing to write at once', async () => {
		const slides = saver();
		await slides.flush();
		expect(batches).toEqual([]);
		expect(statuses).toEqual([]);
	});

	it('runs a task between batches, never during one, with the status and waiting edits left alone', async () => {
		const slides = saver();
		const order: string[] = [];
		let finish!: (isStored: boolean) => void;
		commit = (entries) => {
			batches.push(entries);
			order.push('batch');
			return new Promise<boolean>((resolve) => (finish = resolve));
		};
		const added = slides.change('add');
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		const ran = slides.between(async () => {
			order.push('task');
		});
		slides.edit('a', '# A');
		await vi.advanceTimersByTimeAsync(0);
		expect(order).toEqual(['batch']);
		finish(true);
		await ran;
		expect(order).toEqual(['batch', 'task']);
		expect(slides.pending('a')).toBe('# A');
		await added;
		expect(statuses).toEqual(['saving']);
		commit = async (entries) => {
			batches.push(entries);
			return true;
		};
		await vi.advanceTimersByTimeAsync(300);
		expect(batches).toEqual([[change('add')], [edit('a', '# A')]]);
		expect(statuses).toEqual(['saving', 'saved']);
		await slides.between(async () => {});
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('says saving at once for a change queued while a task runs', async () => {
		const slides = saver();
		let finish!: () => void;
		const ran = slides.between(() => new Promise<void>((resolve) => (finish = resolve)));
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		const added = slides.change('add');
		expect(statuses).toEqual(['saving']);
		finish();
		await ran;
		await added;
		expect(batches).toEqual([[change('add')]]);
		expect(statuses).toEqual(['saving', 'saved']);
	});

	it('keeps writing after a task that fails, and rejects with its error', async () => {
		const slides = saver();
		const failed = slides.between(() => Promise.reject(new Error('unread')));
		const added = slides.change('add');
		await expect(failed).rejects.toThrow('unread');
		await added;
		expect(batches).toEqual([[change('add')]]);
		expect(statuses.at(-1)).toBe('saved');
	});
});
