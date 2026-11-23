/** Whether every edit is stored, some are waiting or being written, or the last write failed. */
export type SaveStatus = 'saved' | 'saving' | 'failed';

export const saveStatusLabels: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', failed: 'Not saved' };

/** What the saver writes: an edit to a slide's markdown, or a change the caller queued with `change`. */
export type SaverEntry<C> = { kind: 'edit'; id: string; markdown: string } | { kind: 'change'; change: C };

export type SlideSaverOptions<C> = {
	/**
	 * Writes the entries waiting their turn, in order, as one batch, resolving once the batch is durable. It resolves to
	 * `false` when some of the batch could not be stored, such as an edit to a slide that is gone: the batch is not tried
	 * again, and the status becomes `failed`. When it throws, nothing in the batch is stored: the status becomes
	 * `failed`, and the batch's edits wait to be written again with the next flush.
	 */
	commit: (entries: SaverEntry<C>[]) => Promise<boolean>;
	/** Hears every change of status. */
	onStatus: (status: SaveStatus) => void;
	/** How long typing must pause, in milliseconds, before an edit is written. */
	delay: number;
};

export type SlideSaver<C> = {
	/** Records an edit to a slide, to be written once typing pauses. */
	edit(id: string, markdown: string): void;
	/** The edit to a slide not yet written, or being written, if there is one. */
	pending(id: string): string | undefined;
	/** Writes every waiting edit now, resolving once they and every write before them are done. */
	flush(): Promise<void>;
	/**
	 * Queues `change` after the waiting edits, so writes reach the database in the order they were asked for, and
	 * resolves once the batch it was written in is done. A failure is reported as the status, never thrown.
	 */
	change(change: C): Promise<void>;
	/** Stops the timer. Waiting edits stay waiting until `flush`. */
	stop(): void;
};

/**
 * Writes slide edits and other changes in the background: an edit waits until typing pauses, and whatever is queued
 * while a batch is written goes, in order, into the next batch. The status says `saved` only once nothing waits and
 * every batch has resolved. An edit whose batch fails waits to be written again with the next flush, unless a newer
 * edit replaced it.
 */
export function createSlideSaver<C>({ commit, onStatus, delay }: SlideSaverOptions<C>): SlideSaver<C> {
	const waiting = new Map<string, string>();
	const writing = new Map<string, string>();
	const queue: SaverEntry<C>[] = [];
	const state: {
		draining?: Promise<void>;
		hasFailed: boolean;
		reported?: SaveStatus;
		timer?: ReturnType<typeof setTimeout>;
	} = { hasFailed: false };

	const report = () => {
		const isBusy = waiting.size > 0 || queue.length > 0 || state.draining !== undefined;
		const status: SaveStatus = state.hasFailed ? 'failed' : isBusy ? 'saving' : 'saved';
		if (status === state.reported) return;
		state.reported = status;
		onStatus(status);
	};

	const stop = () => {
		clearTimeout(state.timer);
		state.timer = undefined;
	};

	const editsIn = (batch: SaverEntry<C>[]) =>
		batch.flatMap((entry) => (entry.kind === 'edit' ? [[entry.id, entry.markdown] as const] : []));

	const forget = (id: string, markdown: string) => {
		if (writing.get(id) === markdown) writing.delete(id);
	};

	const writeBatch = async (batch: SaverEntry<C>[]) => {
		try {
			state.hasFailed = !(await commit(batch));
			for (const [id, markdown] of editsIn(batch)) forget(id, markdown);
		} catch {
			state.hasFailed = true;
			for (const [id, markdown] of editsIn(batch)) {
				forget(id, markdown);
				if (!waiting.has(id)) waiting.set(id, markdown);
			}
		}
	};

	const drain = async (): Promise<void> => {
		if (state.draining) return state.draining;
		if (queue.length === 0) return;
		const { promise, resolve } = Promise.withResolvers<void>();
		state.draining = promise;
		report();
		while (queue.length > 0) await writeBatch(queue.splice(0));
		state.draining = undefined;
		report();
		resolve();
	};

	const queueWaiting = () => {
		stop();
		for (const [id, markdown] of waiting) {
			queue.push({ kind: 'edit', id, markdown });
			writing.set(id, markdown);
		}
		waiting.clear();
	};

	const flush = () => {
		queueWaiting();
		return drain();
	};

	return {
		edit(id, markdown) {
			waiting.set(id, markdown);
			stop();
			state.timer = setTimeout(() => void flush(), delay);
			report();
		},
		pending: (id) => waiting.get(id) ?? writing.get(id),
		flush,
		change(change) {
			queueWaiting();
			queue.push({ kind: 'change', change });
			return drain();
		},
		stop
	};
}
