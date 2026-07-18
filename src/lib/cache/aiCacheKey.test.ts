import { describe, expect, it } from 'vitest';
import {
	cloudTier,
	coarsenContext,
	gearFullKey,
	hashOf,
	snapCoord,
	taskBaseKey,
	taskFullKey
} from './aiCacheKey';
import type { SessionContext } from '$lib/types/context';

function ctx(overrides: Partial<SessionContext> = {}): SessionContext {
	return {
		location: { lat: 55.661, lon: 12.601, accuracyM: 10 },
		weather: { tempC: 20, cloudCoverPct: 45, precipitationMm: 0, windKph: 10, conditions: 'Clear', uvIndex: 3 },
		light: { phase: 'day', sunElevationDeg: 40, minutesUntilChange: 60, label: 'Daylight' },
		...overrides
	};
}

describe('hashOf', () => {
	it('is deterministic for the same value', async () => {
		const a = await hashOf({ x: 1, y: 'a' });
		const b = await hashOf({ x: 1, y: 'a' });
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	it('differs for different values', async () => {
		const a = await hashOf({ x: 1 });
		const b = await hashOf({ x: 2 });
		expect(a).not.toBe(b);
	});
});

describe('snapCoord', () => {
	it('snaps nearby coordinates to the same grid cell', () => {
		expect(snapCoord(55.6611)).toBe(snapCoord(55.6609));
	});

	it('snaps distant coordinates to different cells', () => {
		expect(snapCoord(55.661)).not.toBe(snapCoord(55.7));
	});
});

describe('cloudTier', () => {
	it('buckets percentages into four bands', () => {
		expect(cloudTier(0)).toBe('clear');
		expect(cloudTier(19)).toBe('clear');
		expect(cloudTier(20)).toBe('partly');
		expect(cloudTier(59)).toBe('partly');
		expect(cloudTier(60)).toBe('mostly');
		expect(cloudTier(89)).toBe('mostly');
		expect(cloudTier(90)).toBe('overcast');
		expect(cloudTier(100)).toBe('overcast');
	});
});

describe('coarsenContext', () => {
	it('ignores exact temperature/wind/minute-level differences', () => {
		const a = coarsenContext(ctx());
		const b = coarsenContext(
			ctx({
				weather: { tempC: 23.7, cloudCoverPct: 51, precipitationMm: 0, windKph: 14, conditions: 'Clear', uvIndex: 5 }
			})
		);
		expect(a).toEqual(b);
	});

	it('normalizes the focus place name (case/whitespace)', () => {
		const a = coarsenContext(ctx(), { name: 'Kælkebakke', kind: 'park' });
		const b = coarsenContext(ctx(), { name: '  kælkebakke  ', kind: 'park' });
		expect(a.focusPlace).toBe(b.focusPlace);
		expect(a.focusPlace).toBe('kælkebakke');
	});

	it('is null when there is no focus place', () => {
		expect(coarsenContext(ctx()).focusPlace).toBeNull();
	});
});

describe('taskBaseKey / taskFullKey', () => {
	const base = {
		provider: 'openrouter',
		model: 'anthropic/claude-sonnet-4.5',
		locale: 'en-US',
		skill: 'intermediate',
		bodyId: 'body_canon_eos_r8',
		lensId: 'lens_canon_rf_50_1.8',
		context: ctx()
	};

	it('is stable for identical inputs', async () => {
		expect(await taskBaseKey(base)).toBe(await taskBaseKey({ ...base }));
	});

	it('changes when the rig changes', async () => {
		const a = await taskBaseKey(base);
		const b = await taskBaseKey({ ...base, lensId: 'lens_canon_rf_28' });
		expect(a).not.toBe(b);
	});

	it('changes when the locale or skill changes', async () => {
		const a = await taskBaseKey(base);
		expect(await taskBaseKey({ ...base, locale: 'da' })).not.toBe(a);
		expect(await taskBaseKey({ ...base, skill: 'beginner' })).not.toBe(a);
	});

	it('full key differs by variant for the same base key', async () => {
		const b = await taskBaseKey(base);
		const v0 = await taskFullKey(b, 0);
		const v1 = await taskFullKey(b, 1);
		expect(v0).not.toBe(v1);
	});
});

describe('gearFullKey', () => {
	it('is the same regardless of case/whitespace in make/model', async () => {
		const a = await gearFullKey('gearLens', 'openrouter', 'gpt', 'Canon', 'RF 50mm F1.8 STM');
		const b = await gearFullKey('gearLens', 'openrouter', 'gpt', ' canon ', 'rf 50mm f1.8 stm');
		expect(a).toBe(b);
	});

	it('differs between lens and body kind for the same name', async () => {
		const lens = await gearFullKey('gearLens', 'openrouter', 'gpt', 'Canon', 'EOS R8');
		const body = await gearFullKey('gearBody', 'openrouter', 'gpt', 'Canon', 'EOS R8');
		expect(lens).not.toBe(body);
	});
});
