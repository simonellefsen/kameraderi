// Pure cache-key derivation for the AI response cache: coarsening + hashing only,
// no IndexedDB. Kept separate from aiCache.ts (the Dexie-backed store) so the
// interesting logic is unit-testable without a fake IndexedDB.

import type { NearbyPlace, SessionContext } from '$lib/types/context';

/** SHA-256 hex digest of a value via Web Crypto (fixed key order = deterministic JSON). */
export async function hashOf(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Snap a coordinate to a ~500m grid so nearby-but-not-identical fixes share a cache bucket. */
export function snapCoord(n: number, step = 0.005): number {
	return Math.round(n / step) * step;
}

/** Bucket cloud cover into four bands instead of an exact percentage. */
export function cloudTier(pct: number): 'clear' | 'partly' | 'mostly' | 'overcast' {
	if (pct < 20) return 'clear';
	if (pct < 60) return 'partly';
	if (pct < 90) return 'mostly';
	return 'overcast';
}

/**
 * Coarsen session context so near-identical moments (same spot, same light phase, same
 * weather bucket) share a cache entry instead of fragmenting on exact minute/temperature/wind.
 */
export function coarsenContext(context: SessionContext, focusPlace?: NearbyPlace) {
	return {
		grid: [snapCoord(context.location.lat), snapCoord(context.location.lon)],
		lightPhase: context.light.phase,
		weatherBucket: `${context.weather.conditions}:${cloudTier(context.weather.cloudCoverPct)}`,
		focusPlace: focusPlace?.name.trim().toLowerCase() ?? null
	};
}

export interface TaskBaseKeyInput {
	provider: string;
	model: string;
	locale: string;
	skill: string;
	bodyId: string;
	lensId: string;
	context: SessionContext;
	focusPlace?: NearbyPlace;
}

/** The hash of everything that determines a task EXCEPT the variant ("give me a different one"). */
export async function taskBaseKey(input: TaskBaseKeyInput): Promise<string> {
	return hashOf({
		kind: 'task',
		provider: input.provider,
		model: input.model,
		locale: input.locale,
		skill: input.skill,
		bodyId: input.bodyId,
		lensId: input.lensId,
		...coarsenContext(input.context, input.focusPlace)
	});
}

/** The final cache key for a task: base key + which variant ("New task" re-roll) is wanted. */
export async function taskFullKey(baseKey: string, variant: number): Promise<string> {
	return hashOf({ baseKey, variant });
}

/** Gear specs are locale/context-independent — keyed only by kind, provider/model, and the name. */
export async function gearFullKey(
	kind: 'gearLens' | 'gearBody',
	provider: string,
	model: string,
	make: string,
	itemModel: string
): Promise<string> {
	return hashOf({
		kind,
		provider,
		model,
		make: make.trim().toLowerCase(),
		itemModel: itemModel.trim().toLowerCase()
	});
}
