// The local cost/token meter: records every real (non-cached) LLM call's token usage and
// aggregates it for the Settings UI. Cache hits are intentionally NOT recorded here — they
// cost nothing, and are already tracked separately as "tokens saved" in cache/aiCache.ts.

import { db } from '$lib/db/schema';
import type { UsageEvent } from '$lib/db/schema';
import { uid } from '$lib/utils/id';
import { summarizeUsage, type UsageTotals } from './usageMath';

export type { UsageTotals } from './usageMath';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 30;
/** Keep a bit more history than the rolling window needs, so the window is never short-changed. */
const RETENTION_DAYS = 60;

export type TokenUsage = { inputTokens?: number; outputTokens?: number };

/** Record a real LLM call. No-ops if the provider returned no usage at all. */
export async function recordUsage(
	kind: UsageEvent['kind'],
	provider: string,
	model: string,
	usage: TokenUsage | undefined
): Promise<void> {
	if (!usage || (usage.inputTokens == null && usage.outputTokens == null)) return;
	await db().usageEvents.put({
		id: uid('usage'),
		createdAt: Date.now(),
		kind,
		provider,
		model,
		inputTokens: usage.inputTokens ?? 0,
		outputTokens: usage.outputTokens ?? 0
	});
}

/** Totals for today (since local midnight) — a quick "what did I just spend" signal. */
export async function todayUsage(): Promise<UsageTotals> {
	const midnight = new Date();
	midnight.setHours(0, 0, 0, 0);
	const events = await db().usageEvents.where('createdAt').aboveOrEqual(midnight.getTime()).toArray();
	return summarizeUsage(events, midnight.getTime());
}

/** Totals for the trailing 30 days — the "rolling monthly total" for the budget warning. */
export async function rollingMonthlyUsage(): Promise<UsageTotals> {
	const since = Date.now() - ROLLING_WINDOW_DAYS * DAY_MS;
	const events = await db().usageEvents.where('createdAt').aboveOrEqual(since).toArray();
	return summarizeUsage(events, since);
}

/** Delete events older than the retention window. Best-effort housekeeping; call on app load. */
export async function sweepOldUsageEvents(): Promise<number> {
	const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
	return db().usageEvents.where('createdAt').below(cutoff).delete();
}
