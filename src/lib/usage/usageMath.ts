// Pure aggregation over usage events — no IndexedDB. Kept separate from usageMeter.ts
// (the Dexie-backed store) so the interesting logic is unit-testable directly.

import type { UsageEvent } from '$lib/db/schema';

export interface UsageTotals {
	calls: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

const EMPTY_TOTALS: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** Sum events at or after `sinceMs` (epoch millis). Events are not assumed to be sorted. */
export function summarizeUsage(events: UsageEvent[], sinceMs: number): UsageTotals {
	return events
		.filter((e) => e.createdAt >= sinceMs)
		.reduce((acc, e) => {
			const inputTokens = acc.inputTokens + e.inputTokens;
			const outputTokens = acc.outputTokens + e.outputTokens;
			return {
				calls: acc.calls + 1,
				inputTokens,
				outputTokens,
				totalTokens: inputTokens + outputTokens
			};
		}, EMPTY_TOTALS);
}

/** True once `totals.totalTokens` reaches or exceeds `budget` (no warning when budget is unset). */
export function isOverBudget(totals: UsageTotals, budget: number | null): boolean {
	return budget != null && budget > 0 && totals.totalTokens >= budget;
}
