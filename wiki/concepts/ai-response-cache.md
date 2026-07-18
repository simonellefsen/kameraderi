# Concept: the AI response cache

Every LLM call costs the user tokens (BYOK — it's their bill, not ours). Iris caches **task**
generation and **gear-spec augmentation** responses so a repeated request doesn't repeat the spend.

Implements [roadmap.md](../roadmap.md) Requirement 1. Design decision:
[decisions/2026-07-11-ai-response-cache-design.md](../decisions/2026-07-11-ai-response-cache-design.md).
Code: [cache/aiCacheKey.ts](../src/lib/cache/aiCacheKey.ts) (pure key derivation, unit-tested) +
[cache/aiCache.ts](../src/lib/cache/aiCache.ts) (Dexie-backed store).

## The tension: caching vs. "give me something new"

A naive cache would make **"New task"** return the exact same brief, since nothing about the
context/rig/skill actually changed between clicks — that defeats the button's whole point. The
fix is a **variant counter** per "base key" (everything that determines the task *except* which
attempt this is):

- A **plain** request (the very first "Generate a task", a retry after an error, an accidental
  double-click) asks for **variant N** — the last one generated for this base key — so it's a free
  cache hit if one exists.
- An explicit **"give me something different"** action (New task; re-tapping an already-selected
  Nearby place) bumps the counter to **N+1** first. That's still *looked up* in the cache (not
  force-generated) — if this exact bucket already produced an N+1'th variant before (e.g. the same
  spot, same weather bucket, same rig, on an earlier day), reusing it is still a legitimate "new
  task" from the user's point of view, and free. Otherwise it's a cache miss, so the LLM is called
  and the result becomes the new variant N+1.

This means variety is preserved for the common case (a fresh moment → fresh generation) while
accidental repeats and genuine day-to-day recurrences (same balcony, same golden hour, same rig)
still get served from cache.

## What's coarsened into the cache key

Exact GPS/temperature/minute-of-day would fragment the cache into near-uselessness (every request
is technically unique). The key coarsens context ([aiCacheKey.ts](../src/lib/cache/aiCacheKey.ts)
`coarsenContext`) to:
- **Location** snapped to a ~500m grid.
- **Light** as its phase enum (golden-hour, day, …), not the exact sun elevation.
- **Weather** as `conditions:cloudTier` (four cloud bands), not exact °C/wind/cloud%.
- The **focus place** name (lower-cased/trimmed), if any.

Everything else that changes the *content* of a task — provider, model, locale, skill level, body
id, lens id — is included exactly (no coarsening).

## What's cached vs. not

| Call | Cached? | TTL |
|------|---------|-----|
| Task generation | ✅, keyed as above | `Settings.aiCacheTtlHours` (default 24h) |
| Gear-spec augmentation (lens/body) | ✅, keyed by make+model only | fixed 30 days (deterministic) |
| Evaluation | ❌ | every photo is unique; not worth the key complexity |

A cache **hit** is re-validated against the current Zod schema before use (`safeParse`, not
`parse`) — if the app shipped a schema change since the entry was written, it's treated as a miss
and refetched rather than crashing or returning garbage. See both call sites:
[pipelines/taskGeneration.ts](../src/lib/pipelines/taskGeneration.ts) and
[gear/augment.ts](../src/lib/gear/augment.ts) (`runCachedStructured`).

## Visibility & control (Settings → AI response cache)

- Toggle to disable caching entirely.
- Task cache TTL (hours), user-editable.
- A live stats line: entries cached, hits, and an estimated tokens-saved count (from the `usage`
  the provider returned when each entry was written — tallied in a small `localStorage` counter,
  not the main IndexedDB tables, since it's a throwaway UI metric, not durable state).
- "Clear AI cache" — wipes `aiCache`, `aiCacheVariants`, and the stats counter.

## Housekeeping

Expired rows are swept opportunistically on app load
([+layout.svelte](../src/routes/+layout.svelte) `sweepExpiredAiCache()`), best-effort and
non-blocking — there is no background job (the no-backend/no-reliable-background-work constraint
in [roadmap.md](../roadmap.md) applies here too).
