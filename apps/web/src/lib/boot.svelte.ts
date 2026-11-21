import { errorText } from '#lib/error-text.ts';

export type BootState = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; error: string };

export const boot: { state: BootState } = $state({ state: { status: 'opening' } });

/**
 * Opens the database with `open` and records the outcome in `boot.state`, including a failure `open` reports through
 * `lost` after the database opened.
 */
export async function startBoot<T>(open: (lost: (error: unknown) => void) => Promise<T>): Promise<T | undefined> {
	const lost = (error: unknown) => {
		boot.state = { status: 'failed', error: errorText(error) };
	};
	boot.state = { status: 'opening' };
	try {
		const database = await open(lost);
		boot.state = { status: 'ready' };
		return database;
	} catch (error) {
		lost(error);
		return undefined;
	}
}
