import { expect, it } from 'vitest';
import * as page from './+page.ts';

it('prerenders the landing page', () => {
	expect(page.prerender).toBe(true);
});
