import { db, type KameraderiDB } from './schema';
import { uid } from '$lib/utils/id';

export interface FreedPhotoStorage {
	photoCount: number;
	bytes: number;
}

/** Store a photo Blob and return the key under which it was saved. */
export async function putPhoto(blob: Blob): Promise<string> {
	const key = uid('photo');
	await db().photos.put({ key, blob, createdAt: Date.now() });
	return key;
}

export async function getPhoto(key: string): Promise<Blob | undefined> {
	const rec = await db().photos.get(key);
	return rec?.blob;
}

export async function deletePhoto(key: string): Promise<void> {
	await db().photos.delete(key);
}

/**
 * Drop photo Blobs older than `days` while keeping their metadata + thumbnails so
 * history still renders. Returns the number of Blobs removed. Helps stay within
 * iOS IndexedDB eviction limits.
 */
export async function freeSpaceOlderThan(days: number): Promise<FreedPhotoStorage> {
	return freeSpaceOlderThanIn(db(), days);
}

/** Kept separate so the deletion policy can be unit-tested without a browser IndexedDB instance. */
export async function freeSpaceOlderThanIn(
	database: Pick<KameraderiDB, 'photos' | 'submissions' | 'pendingEvaluations'>,
	days: number,
	now = Date.now()
): Promise<FreedPhotoStorage> {
	const cutoff = now - days * 86_400_000;
	const stale = await database.photos.where('createdAt').below(cutoff).toArray();
	const pending = await database.pendingEvaluations.toArray();
	const pendingSubmissions = await database.submissions.bulkGet(pending.map((p) => p.submissionId));
	const protectedPhotoKeys = new Set(
		pendingSubmissions.flatMap((submission) => (submission ? [submission.photoBlobKey] : []))
	);
	const deletable = stale.filter((photo) => !protectedPhotoKeys.has(photo.key));
	await database.photos.bulkDelete(deletable.map((photo) => photo.key));
	return {
		photoCount: deletable.length,
		bytes: deletable.reduce((total, photo) => total + photo.blob.size, 0)
	};
}
