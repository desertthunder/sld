export type BootState = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; error: string };

export const boot: { state: BootState } = $state({ state: { status: 'opening' } });

export function errorText(error: unknown): string {
	return error instanceof Error ? error.message || error.name : String(error);
}

/** Opens the database with `open` and records the outcome in `boot.state`. */
export async function startBoot<T>(open: () => Promise<T>): Promise<T | undefined> {
	boot.state = { status: 'opening' };
	try {
		const database = await open();
		boot.state = { status: 'ready' };
		return database;
	} catch (error) {
		boot.state = { status: 'failed', error: errorText(error) };
		return undefined;
	}
}
