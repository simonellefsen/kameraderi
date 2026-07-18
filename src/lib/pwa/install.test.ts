import { describe, expect, it } from 'vitest';
import { isAndroidBrowser, isIosBrowser, isStandalone } from './install';

describe('isIosBrowser', () => {
	it('recognizes iPhone and iPad user agents', () => {
		expect(isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
		expect(isIosBrowser('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5)).toBe(true);
	});

	it('recognizes an iPad that presents itself as a Mac', () => {
		expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe(true);
	});

	it('does not mistake a desktop Mac or Android device for iOS', () => {
		expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0)).toBe(false);
		expect(isIosBrowser('Mozilla/5.0 (Linux; Android 15)', 5)).toBe(false);
	});
});

describe('isStandalone', () => {
	it('accepts either modern display-mode or legacy iOS standalone detection', () => {
		expect(isStandalone(true, false)).toBe(true);
		expect(isStandalone(false, true)).toBe(true);
		expect(isStandalone(false, false)).toBe(false);
	});
});

describe('isAndroidBrowser', () => {
	it('recognizes Android without misclassifying iOS', () => {
		expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe(true);
		expect(isAndroidBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
	});
});
