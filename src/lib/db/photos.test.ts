import { describe, expect, it, vi } from 'vitest';
import { freeSpaceOlderThanIn } from './photos';
import type { KameraderiDB, PhotoBlobRecord } from './schema';

function photo(key: string, createdAt: number, size: number): PhotoBlobRecord {
	return { key, blob: new Blob([new Uint8Array(size)]), createdAt };
}

describe('freeSpaceOlderThanIn', () => {
	it('keeps blobs referenced by a pending offline evaluation', async () => {
		const now = Date.UTC(2026, 6, 18);
		const oldPhoto = photo('old', now - 91 * 86_400_000, 20);
		const queuedPhoto = photo('queued', now - 91 * 86_400_000, 30);
		const bulkDelete = vi.fn().mockResolvedValue(undefined);
		const database = {
			photos: {
				where: () => ({ below: () => ({ toArray: async () => [oldPhoto, queuedPhoto] }) }),
				bulkDelete
			},
			pendingEvaluations: { toArray: async () => [{ submissionId: 'sub-queued' }] },
			submissions: { bulkGet: async () => [{ id: 'sub-queued', photoBlobKey: 'queued' }] }
		} as unknown as Pick<KameraderiDB, 'photos' | 'submissions' | 'pendingEvaluations'>;

		const result = await freeSpaceOlderThanIn(database, 90, now);

		expect(result).toEqual({ photoCount: 1, bytes: 20 });
		expect(bulkDelete).toHaveBeenCalledWith(['old']);
	});
});
