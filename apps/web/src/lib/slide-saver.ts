/** Whether every edit is stored, some are waiting or being written, or the last write failed. */
export type SaveStatus = 'saved' | 'saving' | 'failed';

export const saveStatusLabels: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', failed: 'Not saved' };

export type SlideSaverOptions = {
	/** Stores a slide's markdown, resolving once it is durable. */
	save: (id: string, markdown: string) => Promise<unknown>;
	/** Hears every change of status. */
	onStatus: (status: SaveStatus) => void;
	/** How long typing must pause, in milliseconds, before an edit is written. */
	delay: number;
};

export type SlideSaver = {
	/** Records an edit to a slide, to be written once typing pauses. */
	edit(id: string, markdown: string): void;
	/** The edit to a slide not yet written, or being written, if there is one. */
	pending(id: string): string | undefined;
	/** Writes every waiting edit now, resolving once they and every write before them are done. */
	flush(): Promise<void>;
	/**
	 * Writes the waiting edits, then runs `write` after them, so writes reach the database in the order they were asked
	 * for. A failure is reported as the `failed` status and rethrown. When `isDropped` returns true as its turn comes,
	 * `write` doesn't run, the status stays as it was, and the promise resolves to `undefined`.
	 */
	run<T>(write: () => Promise<T>, isDropped?: () => boolean): Promise<T | undefined>;
	/** Stops the timer. Waiting edits stay waiting until `flush`. */
	stop(): void;
};

/**
 * Writes slide edits in the background: an edit waits until typing pauses, every write runs after the ones before it,
 * and the status says `saved` only once nothing waits and every write has resolved. An edit whose write fails waits to
 * be written again with the next flush, unless a newer edit replaced it.
 */
export function createSlideSaver({ save, onStatus, delay }: SlideSaverOptions): SlideSaver {
	const waiting = new Map<string, string>();
	const writing = new Map<string, string>();
	const state: {
		queue: Promise<void>;
		running: number;
		hasFailed: boolean;
		reported?: SaveStatus;
		timer?: ReturnType<typeof setTimeout>;
	} = { queue: Promise.resolve(), running: 0, hasFailed: false };

	const report = () => {
		const isBusy = waiting.size > 0 || state.running > 0;
		const status: SaveStatus = state.hasFailed ? 'failed' : isBusy ? 'saving' : 'saved';
		if (status === state.reported) return;
		state.reported = status;
		onStatus(status);
	};

	const settle = async (promise: Promise<unknown>) => {
		try {
			await promise;
		} catch {
			// The caller that queued the write hears its error.
		}
	};

	const enqueue = <T>(write: () => Promise<T>, isDropped?: () => boolean): Promise<T | undefined> => {
		state.running++;
		report();
		const previous = state.queue;
		const result = (async () => {
			await previous;
			try {
				if (isDropped?.()) return;
				const value = await write();
				state.hasFailed = false;
				return value;
			} catch (error) {
				state.hasFailed = true;
				throw error;
			} finally {
				state.running--;
				report();
			}
		})();
		state.queue = settle(result);
		return result;
	};

	const stop = () => {
		clearTimeout(state.timer);
		state.timer = undefined;
	};

	const forget = (id: string, markdown: string) => {
		if (writing.get(id) === markdown) writing.delete(id);
	};

	const writeWaiting = async (): Promise<void> => {
		stop();
		const edits = [...waiting];
		waiting.clear();
		if (edits.length === 0) {
			await state.queue;
			return;
		}
		for (const [id, markdown] of edits) writing.set(id, markdown);
		await enqueue(async () => {
			for (const [index, [id, markdown]] of edits.entries()) {
				try {
					await save(id, markdown);
					forget(id, markdown);
				} catch (error) {
					for (const [laterId, laterMarkdown] of edits.slice(index)) {
						forget(laterId, laterMarkdown);
						if (!waiting.has(laterId)) waiting.set(laterId, laterMarkdown);
					}
					throw error;
				}
			}
		});
	};

	return {
		edit(id, markdown) {
			waiting.set(id, markdown);
			stop();
			state.timer = setTimeout(() => void settle(writeWaiting()), delay);
			report();
		},
		pending: (id) => waiting.get(id) ?? writing.get(id),
		flush: writeWaiting,
		async run(write, isDropped) {
			const flushed = settle(writeWaiting());
			const result = enqueue(write, isDropped);
			await flushed;
			return result;
		},
		stop
	};
}
