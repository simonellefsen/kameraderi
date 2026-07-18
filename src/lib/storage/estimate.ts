export interface StorageEstimate {
	usage?: number;
	quota?: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return {};
	return navigator.storage.estimate();
}

export function formatStorageBytes(bytes: number | undefined): string {
	if (bytes == null || !Number.isFinite(bytes)) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
