import { expect, it } from 'vitest';
import * as layout from './+layout.ts';

it('renders on the client only', () => {
	expect(layout.ssr).toBe(false);
});
