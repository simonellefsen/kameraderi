import { describe, expect, it } from 'vitest';
import { isOverBudget, summarizeUsage } from './usageMath';
import type { UsageEvent } from '$lib/db/schema';

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
	return {
		id: 'usage_1',
		createdAt: Date.now(),
		kind: 'task',
		provider: 'openrouter',
		model: 'anthropic/claude-sonnet-4.5',
		inputTokens: 100,
		outputTokens: 50,
		...overrides
	};
}

describe('summarizeUsage', () => {
	it('sums tokens and counts calls within the window', () => {
		const events = [
			event({ inputTokens: 100, outputTokens: 50 }),
			event({ inputTokens: 200, outputTokens: 80 })
		];
		const totals = summarizeUsage(events, 0);
		expect(totals).toEqual({ calls: 2, inputTokens: 300, outputTokens: 130, totalTokens: 430 });
	});

	it('excludes events before sinceMs', () => {
		const events = [
			event({ createdAt: 1000, inputTokens: 100, outputTokens: 50 }),
			event({ createdAt: 5000, inputTokens: 200, outputTokens: 80 })
		];
		const totals = summarizeUsage(events, 2000);
		expect(totals).toEqual({ calls: 1, inputTokens: 200, outputTokens: 80, totalTokens: 280 });
	});

	it('is order-independent', () => {
		const events = [
			event({ createdAt: 5000, inputTokens: 1 }),
			event({ createdAt: 1000, inputTokens: 2 }),
			event({ createdAt: 3000, inputTokens: 4 })
		];
		const totals = summarizeUsage(events, 0);
		expect(totals.inputTokens).toBe(7);
		expect(totals.calls).toBe(3);
	});

	it('returns zeroed totals for an empty list', () => {
		expect(summarizeUsage([], 0)).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
	});
});

describe('isOverBudget', () => {
	const totals = summarizeUsage([event({ inputTokens: 600, outputTokens: 400 })], 0);

	it('is false when no budget is set', () => {
		expect(isOverBudget(totals, null)).toBe(false);
	});

	it('is false when a budget of 0 is set (treated as unset)', () => {
		expect(isOverBudget(totals, 0)).toBe(false);
	});

	it('is false below budget and true at/above it', () => {
		expect(isOverBudget(totals, 2000)).toBe(false);
		expect(isOverBudget(totals, 1000)).toBe(true);
		expect(isOverBudget(totals, 500)).toBe(true);
	});
});
