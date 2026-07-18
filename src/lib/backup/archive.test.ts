import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, BACKUP_VERSION, createBackup, parseBackup } from './archive';
import type { KameraderiDB, SettingsRecord } from '$lib/db/schema';

function backupTables(): Pick<
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
> {
	const settings = {
		id: 'app',
		activeProvider: 'openrouter',
		skillLevel: 'intermediate',
		units: 'metric',
		llmAugmentGear: true,
		activeRig: null,
		locale: 'en',
		aiCacheEnabled: true,
		aiCacheTtlHours: 24,
		monthlyTokenBudget: null,
		installPromptDismissed: true,
		providers: {
			openrouter: { key: 'openrouter', apiKey: 'secret-key', textModel: 'text', visionModel: 'vision' }
		}
	} as unknown as SettingsRecord;
	const table = { toArray: async () => [] };
	return {
		settings: { get: async () => settings },
		bodies: table,
		lenses: table,
		gearProfiles: table,
		tasks: table,
		submissions: table,
		evaluations: table,
		sessions: table,
		pendingEvaluations: table,
		photos: {
			toArray: async () => [
				{ key: 'photo', createdAt: 1, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) }
			]
		},
		transaction: async () => undefined
	} as unknown as Pick<KameraderiDB, keyof KameraderiDB>;
}

describe('portable backup archive', () => {
	it('serializes downscaled photos but never serializes an API key', async () => {
		const archive = await createBackup(backupTables());
		const text = JSON.stringify(archive);

		expect(archive.format).toBe(BACKUP_FORMAT);
		expect(archive.version).toBe(BACKUP_VERSION);
		expect(archive.photos[0]).toMatchObject({ key: 'photo', type: 'image/jpeg', base64: 'AQID' });
		expect(text).not.toContain('secret-key');
		expect(parseBackup(text).ok).toBe(true);
	});

	it('rejects non-backup JSON before restore can start', () => {
		expect(parseBackup('{"format":"other"}')).toEqual({
			ok: false,
			error: 'This is not a supported Kameraderi backup file.'
		});
	});
});
