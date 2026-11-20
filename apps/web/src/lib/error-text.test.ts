import { describe, expect, it } from 'vitest';
import { errorText } from '#lib/error-text.ts';

describe('errorText', () => {
	it('reads the message of an error', () => {
		expect(errorText(new Error('IndexedDB is unavailable'))).toBe('IndexedDB is unavailable');
	});

	it('falls back to the error name or the thrown value', () => {
		expect(errorText(new DOMException('', 'QuotaExceededError'))).toBe('QuotaExceededError');
		expect(errorText('no worker')).toBe('no worker');
	});

	it('reads an error that structured cloning turned into a plain object', () => {
		const cloned = structuredClone({ name: 'ErrnoError', errno: 44, stack: '<generic error, no stack>' });
		expect(errorText(cloned)).toBe('ErrnoError (errno 44)');
		expect(errorText({ message: 'Invalid FS bundle size' })).toBe('Invalid FS bundle size');
	});

	it('never answers with [object Object]', () => {
		expect(errorText({ code: 7 })).toBe('{"code":7}');
		expect(errorText({})).toBe('Unknown error');
	});
});
