import { expect, it } from 'vitest';
import * as page from './+page.ts';

it('prerenders the page without client code', () => {
	expect(page.prerender).toBe(true);
	expect(page.csr).toBe(false);
});
