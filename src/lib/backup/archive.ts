import { db, SETTINGS_KEY, type KameraderiDB, type PhotoBlobRecord, type SettingsRecord } from '$lib/db/schema';
import type { Evaluation } from '$lib/types/evaluation';
import type { CameraBody, GearProfile, Lens } from '$lib/types/gear';
import type { CoachingSession } from '$lib/types/session';
import type { ProviderConfig, ProviderKey, Settings } from '$lib/types/settings';
import type { Submission } from '$lib/types/submission';
import type { Task } from '$lib/types/task';
import type { PendingEvaluation } from '$lib/db/schema';
import { err, ok, type Result } from '$lib/utils/result';

export const BACKUP_FORMAT = 'kameraderi-backup';
export const BACKUP_VERSION = 1;

type BackupProviderConfig = Omit<ProviderConfig, 'apiKey'>;
type BackupSettings = Omit<Settings, 'providers' | 'installPromptDismissed'> & {
	providers: Record<ProviderKey, BackupProviderConfig>;
};

export interface BackupPhoto {
	key: string;
	createdAt: number;
	type: string;
	base64: string;
}

export interface BackupArchive {
	format: typeof BACKUP_FORMAT;
	version: typeof BACKUP_VERSION;
	createdAt: number;
	settings?: BackupSettings;
	bodies: CameraBody[];
	lenses: Lens[];
	gearProfiles: GearProfile[];
	tasks: Task[];
	submissions: Submission[];
	evaluations: Evaluation[];
	sessions: CoachingSession[];
	pendingEvaluations: PendingEvaluation[];
	photos: BackupPhoto[];
}

type BackupTables = Pick<
	KameraderiDB,
	| 'settings'
	| 'transaction'
	| 'bodies'
	| 'lenses'
	| 'gearProfiles'
	| 'tasks'
	| 'submissions'
	| 'evaluations'
	| 'sessions'
	| 'pendingEvaluations'
	| 'photos'
>;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let start = 0; start < bytes.length; start += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
	}
	return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return new Blob([bytes], { type });
}

function withoutApiKeys(record: SettingsRecord | undefined): BackupSettings | undefined {
	if (!record) return undefined;
	const { id: _id, installPromptDismissed: _dismissed, providers, ...settings } = record;
	return {
		...settings,
		providers: Object.fromEntries(
			Object.entries(providers).map(([key, config]) => {
				const { apiKey: _apiKey, ...safeConfig } = config;
				return [key, safeConfig];
			})
		) as BackupSettings['providers']
	};
}

function archiveLooksValid(value: unknown): value is BackupArchive {
	if (!value || typeof value !== 'object') return false;
	const backup = value as Partial<BackupArchive>;
	return (
		backup.format === BACKUP_FORMAT &&
		backup.version === BACKUP_VERSION &&
		typeof backup.createdAt === 'number' &&
		Array.isArray(backup.bodies) &&
		Array.isArray(backup.lenses) &&
		Array.isArray(backup.gearProfiles) &&
		Array.isArray(backup.tasks) &&
		Array.isArray(backup.submissions) &&
		Array.isArray(backup.evaluations) &&
		Array.isArray(backup.sessions) &&
		Array.isArray(backup.pendingEvaluations) &&
		Array.isArray(backup.photos)
	);
}

export function parseBackup(text: string): Result<BackupArchive, string> {
	try {
		const value: unknown = JSON.parse(text);
		return archiveLooksValid(value) ? ok(value) : err('This is not a supported Kameraderi backup file.');
	} catch {
		return err('This backup file is not valid JSON.');
	}
}

/** Build a portable, JSON-safe archive. Photos are the already-downscaled copies only. */
export async function createBackup(database: BackupTables = db()): Promise<BackupArchive> {
	const [settings, bodies, lenses, gearProfiles, tasks, submissions, evaluations, sessions, pendingEvaluations, photos] =
		await Promise.all([
			database.settings.get(SETTINGS_KEY),
			database.bodies.toArray(),
			database.lenses.toArray(),
			database.gearProfiles.toArray(),
			database.tasks.toArray(),
			database.submissions.toArray(),
			database.evaluations.toArray(),
			database.sessions.toArray(),
			database.pendingEvaluations.toArray(),
			database.photos.toArray()
		]);

	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		createdAt: Date.now(),
		settings: withoutApiKeys(settings),
		bodies,
		lenses,
		gearProfiles,
		tasks,
		submissions,
		evaluations,
		sessions,
		pendingEvaluations,
		photos: await Promise.all(photos.map(encodePhoto))
	};
}

async function encodePhoto(photo: PhotoBlobRecord): Promise<BackupPhoto> {
	return {
		key: photo.key,
		createdAt: photo.createdAt,
		type: photo.blob.type || 'image/jpeg',
		base64: bytesToBase64(new Uint8Array(await photo.blob.arrayBuffer()))
	};
}

function restoredSettings(backup: BackupSettings | undefined, current: SettingsRecord | undefined): SettingsRecord | undefined {
	if (!backup) return current;
	const providers = Object.fromEntries(
		Object.entries(backup.providers).map(([key, config]) => [
			key,
			{ ...config, apiKey: current?.providers[key as ProviderKey]?.apiKey ?? '' }
		])
	) as Settings['providers'];
	return {
		...backup,
		id: SETTINGS_KEY,
		providers,
		installPromptDismissed: current?.installPromptDismissed ?? false
	};
}

/** Replace the coaching-library tables atomically. The receiving device's API keys are retained. */
export async function restoreBackup(
	backup: BackupArchive,
	database: BackupTables = db()
): Promise<Result<void, string>> {
	if (!archiveLooksValid(backup)) return err('This is not a supported Kameraderi backup file.');
	try {
		const currentSettings = await database.settings.get(SETTINGS_KEY);
		const settings = restoredSettings(backup.settings, currentSettings);
		const photos = backup.photos.map((photo) => ({
			key: photo.key,
			createdAt: photo.createdAt,
			blob: base64ToBlob(photo.base64, photo.type)
		}));

		await database.transaction(
			'rw',
			[
				database.settings,
				database.bodies,
				database.lenses,
				database.gearProfiles,
				database.tasks,
				database.submissions,
				database.evaluations,
				database.sessions,
				database.pendingEvaluations,
				database.photos
			],
			async () => {
				await Promise.all([
					database.settings.clear(),
					database.bodies.clear(),
					database.lenses.clear(),
					database.gearProfiles.clear(),
					database.tasks.clear(),
					database.submissions.clear(),
					database.evaluations.clear(),
					database.sessions.clear(),
					database.pendingEvaluations.clear(),
					database.photos.clear()
				]);
				if (settings) await database.settings.put(settings);
				await Promise.all([
					database.bodies.bulkPut(backup.bodies),
					database.lenses.bulkPut(backup.lenses),
					database.gearProfiles.bulkPut(backup.gearProfiles),
					database.tasks.bulkPut(backup.tasks),
					database.submissions.bulkPut(backup.submissions),
					database.evaluations.bulkPut(backup.evaluations),
					database.sessions.bulkPut(backup.sessions),
					database.pendingEvaluations.bulkPut(backup.pendingEvaluations),
					database.photos.bulkPut(photos)
				]);
			}
		);
		return ok(undefined);
	} catch (e) {
		return err(`Could not restore this backup: ${e instanceof Error ? e.message : String(e)}`);
	}
}
