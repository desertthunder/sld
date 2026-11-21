import { errorText } from '#lib/error-text.ts';
import type { MigrationProgress } from '#lib/migrate.ts';

export type BootState =
	{ status: 'opening'; migrations?: MigrationProgress } | { status: 'ready' } | { status: 'failed'; error: string };

export const boot: { state: BootState } = $state({ state: { status: 'opening' } });

/**
 * Opens the database with `open` and records the outcome in `boot.state`, including the migration progress `open`
 * reports through `progress` while opening, and a failure it reports through `lost` after the database opened.
 */
export async function startBoot<T>(
	open: (lost: (error: unknown) => void, progress: (migrations: MigrationProgress) => void) => Promise<T>
): Promise<T | undefined> {
	const lost = (error: unknown) => {
		boot.state = { status: 'failed', error: errorText(error) };
	};
	const progress = (migrations: MigrationProgress) => {
		if (boot.state.status === 'opening') boot.state = { status: 'opening', migrations };
	};
	boot.state = { status: 'opening' };
	try {
		const database = await open(lost, progress);
		boot.state = { status: 'ready' };
		return database;
	} catch (error) {
		lost(error);
		return undefined;
	}
}
