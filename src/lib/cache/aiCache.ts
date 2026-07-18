// The AI response cache: Dexie-backed storage for validated LLM responses, plus a
// small localStorage hit/tokens-saved counter for the Settings UI. Key derivation
// lives in aiCacheKey.ts (pure, unit-tested); this file only touches IndexedDB.

import { browser } from '$app/environment';
import { db } from '$lib/db/schema';
import { settings } from '$lib/stores/settings.svelte';
import type { AiCacheEntry } from '$lib/db/schema';

export type TokenUsage = { inputTokens?: number; outputTokens?: number };

const STATS_KEY = 'kameraderi-ai-cache-stats';

interface CacheStats {
	hits: number;
	tokensSaved: number;
}

function readStats(): CacheStats {
	if (!browser) return { hits: 0, tokensSaved: 0 };
	try {
		const raw = localStorage.getItem(STATS_KEY);
		if (!raw) return { hits: 0, tokensSaved: 0 };
		const d = JSON.parse(raw);
		return { hits: Number(d.hits) || 0, tokensSaved: Number(d.tokensSaved) || 0 };
	} catch {
		return { hits: 0, tokensSaved: 0 };
	}
}

function recordHit(usage?: TokenUsage): void {
	if (!browser) return;
	try {
		const s = readStats();
		s.hits += 1;
		s.tokensSaved += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
		localStorage.setItem(STATS_KEY, JSON.stringify(s));
	} catch {
		// best-effort only
	}
}

/** Current cache hit count + estimated tokens saved, for the Settings UI. */
export function aiCacheStats(): CacheStats {
	return readStats();
}

/**
 * Resolve the variant index for a base key. `forceNew` (an explicit "give me something
 * different" action) bumps and persists the counter; otherwise the last-used variant is
 * returned unchanged, so an identical, unforced request (retry after an error, duplicate
 * click, app relaunch within the TTL) reuses the same cache slot.
 */
export async function resolveVariant(baseKey: string, forceNew: boolean): Promise<number> {
	const table = db().aiCacheVariants;
	const row = await table.get(baseKey);
	const current = row?.count ?? 0;
	if (!forceNew) return current;
	const next = current + 1;
	await table.put({ baseKey, count: next, updatedAt: Date.now() });
	return next;
}

/**
 * Read a cache entry by its full key. Returns undefined when caching is disabled, the entry
 * is missing, or it has expired (expired rows are opportunistically deleted). Records a hit
 * for the Settings stats display on success.
 */
export async function getCacheEntry<T>(key: string): Promise<T | undefined> {
	if (!settings.current.aiCacheEnabled) return undefined;
	const entry = await db().aiCache.get(key);
	if (!entry) return undefined;
	if (entry.expiresAt < Date.now()) {
		await db().aiCache.delete(key);
		return undefined;
	}
	recordHit(entry.usage);
	return entry.response as T;
}

/** Write a cache entry. No-ops when caching is disabled. */
export async function setCacheEntry(
	key: string,
	kind: AiCacheEntry['kind'],
	provider: string,
	model: string,
	response: unknown,
	usage: TokenUsage | undefined,
	ttlHours: number
): Promise<void> {
	if (!settings.current.aiCacheEnabled) return;
	const now = Date.now();
	await db().aiCache.put({
		key,
		kind,
		provider,
		model,
		response,
		usage,
		createdAt: now,
		expiresAt: now + ttlHours * 60 * 60 * 1000
	});
}

/** Delete expired rows. Best-effort housekeeping; call opportunistically (e.g. on app load). */
export async function sweepExpiredAiCache(): Promise<number> {
	const now = Date.now();
	return db().aiCache.where('expiresAt').below(now).delete();
}

/** Full reset: cache entries, variant counters, and the stats counter. */
export async function clearAiCache(): Promise<void> {
	await db().aiCache.clear();
	await db().aiCacheVariants.clear();
	if (browser) localStorage.removeItem(STATS_KEY);
}

/** Number of currently-cached (unexpired) entries, for the Settings UI. */
export async function aiCacheEntryCount(): Promise<number> {
	return db().aiCache.where('expiresAt').aboveOrEqual(Date.now()).count();
}
