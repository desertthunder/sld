import { expect, test as base } from '@playwright/test';

// TODO: stop ignoring PGlite's multi-tab worker once it no longer posts on a closed `BroadcastChannel` as a tab reloads.
const isPgliteWorker = (stack: string) =>
	/\/@electric-sql\/pglite\/dist\/worker\//.test(
		stack.split('\n').find((line) => line.trim().startsWith('at ')) ?? ''
	);

/**
 * Playwright's `test`, failing any test in which a page throws an error or rejects a promise that nothing handles, in
 * any tab the test opens. Errors a page logs to the console still pass, since a failed write logs one on purpose.
 */
export const test = base.extend<{ pageErrors: void }>({
	pageErrors: [
		async ({ context }, use) => {
			const errors: string[] = [];
			context.on('weberror', (webError) => {
				const error = webError.error();
				const stack = error.stack ?? String(error);
				if (!isPgliteWorker(stack)) errors.push(stack);
			});
			await use();
			expect(errors).toEqual([]);
		},
		{ auto: true }
	]
});
