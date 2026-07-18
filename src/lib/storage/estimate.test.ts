import { describe, expect, it } from 'vitest';
import { formatStorageBytes } from './estimate';

describe('formatStorageBytes', () => {
	it('formats unavailable and byte values compactly', () => {
		expect(formatStorageBytes(undefined)).toBe('—');
		expect(formatStorageBytes(999)).toBe('999 B');
		expect(formatStorageBytes(1024)).toBe('1.0 KB');
		expect(formatStorageBytes(3 * 1024 * 1024)).toBe('3.0 MB');
	});
});
