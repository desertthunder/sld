import { errorText } from '#lib/error-text.ts';
import { OutdatedDatabaseError, type MigrationProgress } from '#lib/migrate.ts';

/** `outdated` means another tab with older code holds the database, so this tab must not use it. */
export type BootState =
	| { status: 'opening'; migrations?: MigrationProgress }
	| { status: 'ready' }
	| { status: 'outdated' }
	| { status: 'failed'; error: string };

/** What the `outdated` state tells the person. */
export const outdatedCopy = {
	label: "can't open",
	heading: 'sld was updated in another tab',
	text: 'Close your other sld tabs and reload.',
	action: 'Reload'
} as const;

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
		if (error instanceof OutdatedDatabaseError) boot.state = { status: 'outdated' };
		else lost(error);
		return undefined;
	}
}
