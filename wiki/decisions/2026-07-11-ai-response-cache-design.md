# Decision: AI response cache — coarsening + variant-counter design

**Date**: 2026-07-11
**Status**: accepted

## Context

Requested: cache task/gear-spec LLM responses for a configurable period (24h default) to save
tokens, without a backend. Two requirements are in tension: caching implies reuse, but "New task"
and re-rolling a place both imply the user wants **something different** each time.

## Decision

- **Cache key = coarsened base key + a per-base-key variant counter.** The base key hashes
  provider/model/locale/skill/rig exactly, but coarsens context: location to a ~500m grid, light to
  its phase enum, weather to a `conditions:cloudTier` bucket (four bands). See
  [concepts/ai-response-cache.md](../concepts/ai-response-cache.md) for the full rationale and
  [cache/aiCacheKey.ts](../src/lib/cache/aiCacheKey.ts) for the implementation.
- **Plain requests** (first generation, retry-after-error, accidental duplicate click) reuse the
  **last** variant for that base key — free when available.
- **Explicit "different" requests** (New task; re-tapping an already-selected Nearby place) bump
  the variant counter *before* looking up the cache. This still allows a hit (a genuine recurrence
  of the same bucket on a different day), but guarantees it never just replays the task the user is
  currently looking at.
- **Storage**: two new Dexie tables, `aiCache` (the entries) and `aiCacheVariants` (the counters) —
  see [schema.md](../schema.md). A separate tiny `localStorage` counter tracks hits/tokens-saved for
  the Settings UI (not durable app state, so it doesn't need a Dexie table or migration).
- **Validated data only.** The cache stores the post-Zod-parse object, not the raw provider
  payload, and a cache *hit* is re-validated (`safeParse`) before use — a schema change between app
  versions degrades to a cache miss, never a crash.
- **TTLs**: task generation uses the user-configurable `Settings.aiCacheTtlHours` (default 24).
  Gear-spec augmentation uses a fixed 30 days — those specs are deterministic by make+model and
  don't need a user-facing knob.
- **Evaluation is not cached.** Every submitted photo is unique; there's no meaningful reuse case.

## Alternatives considered

- **No variant concept, cache everything by exact key** — rejected: "New task" would return the
  identical brief until the TTL expired or something in the (coarse) context changed, which
  defeats the button.
- **Never cache task generation, only gear specs** — rejected: task generation is the highest-
  frequency, highest-token call in the app; it's the biggest win.
- **Coarsen further (e.g. drop rig from the key)** — rejected: rig materially changes feasible
  constraints (aperture/focal range), so two different lenses must never share a cached task.

## Consequences

- Settings gained `aiCacheEnabled` (default on) and `aiCacheTtlHours` (default 24) — new fields
  merge into existing persisted settings via the existing defaults-merge pattern in
  `stores/settings.svelte.ts`, so no migration is needed for the `Settings` object itself (only the
  two new Dexie tables required a schema version bump, v1 → v2).
- Any future caller of `activeProvider().generateStructured()` for a new kind of structured
  response should decide explicitly whether it belongs in this cache (most should — see
  [concepts/ai-response-cache.md](../concepts/ai-response-cache.md) for the "what's cached" table)
  rather than bypassing it silently.
