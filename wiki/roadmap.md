# Roadmap

Where Iris goes next. This is a living plan — reorder freely, and promote anything with real design
weight into a dated [decision](decisions/README.md). Cross-refs: [index.md](index.md) ·
[architecture.md](architecture.md) · [log.md](log.md).

## The hard constraint: no backend

Everything must run on the device, using only **client-side state that the browser/iOS gives a web
app**. That is the frame every feature below is designed within.

**Allowed** (this is our whole toolbox):
- **IndexedDB** (Dexie) — structured data + photo blobs.
- **localStorage / sessionStorage** — small key/values (active session, prefs).
- **Cache Storage API** + **service worker** — offline shell, runtime-cached API responses.
- **Web Crypto** — hashing (cache keys) and at-rest key encryption.
- **Device APIs** already in use — geolocation, `<input capture>`, EXIF, Web Share, Notifications
  (while the app is open).

**Not available** (needs a server → out of scope):
- Cross-device sync, shared accounts, server-side LLM proxying or key storage.
- **Sending** push notifications (iOS 16.4+ can *receive* Web Push, but delivery needs an app
  server + push service). Proactive "golden hour is starting" reminders therefore can't be
  guaranteed — the no-backend workaround is an **`.ics` calendar export** and in-app countdowns.
- Background work beyond the OS's short service-worker windows (iOS is strict). No reliable
  scheduled/background regeneration.

Consequence to keep repeating: **storage is the user's and can be evicted** (esp. iOS after ~7 days
inactivity). Backup/export is a feature, not a nicety — see
[concepts/local-first-pwa.md](concepts/local-first-pwa.md).

## Guiding principles

1. **Save the user's tokens.** Every LLM call is their money. Cache, dedupe, route to cheaper
   models, and compute locally what we can.
2. **Degrade gracefully.** No key / offline / evicted storage should never be a dead end.
3. **Feasible by construction.** Keep clamping tasks to the rig; never surface an impossible brief.
4. **Local-first, private.** Photos and keys stay on device; new features must not change that.
5. **Small bundle.** It's a mobile PWA — weigh every dependency.

---

## Requirement 1 — Cache AI responses (configurable TTL, 24h default)

**Goal:** stop paying tokens for responses we already have. Highest-value, do first.

### What to cache
| Call | Cache? | Why / TTL |
|------|--------|-----------|
| **Task generation** | ✅ | Biggest recurring cost. TTL = `aiCacheTtlHours` (default **24h**). |
| **Gear augmentation** (lens/body specs) | ✅ | Deterministic by make+model — cache **long (30d)**; specs don't change. |
| **Evaluation** | ➖ | Each photo is unique. Only cache by exact image hash to absorb accidental double-submits (short TTL). |
| Weather / geocode / places | ✅ (already) | Handled by the service worker runtime cache. |

### Design
- New Dexie table **`aiCache`**: `{ key, kind, provider, model, response(JSON), createdAt, expiresAt }`,
  indexed on `expiresAt` for cheap sweeping. Bump the Dexie version in
  [db/schema.ts](../src/lib/db/schema.ts) and document in [schema.md](schema.md).
- **Cache key** = a Web Crypto SHA-256 of a canonical string built from everything that changes the
  answer: `kind` + `provider` + `model` + `locale` + `skillLevel` + rig (`bodyId`/`lensId`) +
  **coarsened context** (location snapped to a ~few-hundred-metre grid, light *phase band* not exact
  minutes, weather bucketed to conditions/cloud-tier) + `focusPlace?.name` + a **variant counter**.
- **Variant counter** resolves the "cache vs. variety" tension: the *same* inputs return the cached
  task for free, but **"New task"** (or re-rolling the same place) increments the variant, so the
  user still gets something fresh — and each variant is itself cached. Material context change
  resets it.
- **Wrap, don't scatter:** a thin `cachedGenerateStructured()` around the provider call in the
  pipelines ([taskGeneration.ts](../src/lib/pipelines/taskGeneration.ts),
  [gear/augment.ts](../src/lib/gear/augment.ts)) — check cache → on miss call provider → store. Zod
  validation stays outside so we never cache an invalid payload.
- **Settings:** `aiCacheEnabled` (default on) + `aiCacheTtlHours` (default 24). A "Clear AI cache"
  button and a cache-hit/token-saved counter for visibility.
- **Housekeeping:** sweep expired rows on load; count expired against the "free up space" tool.

---

## Requirement 2 — themes & feature backlog

Grouped by area; roughly ordered by value-to-effort within each. Nothing here needs a server.

### A. Token & cost control (pairs with the cache)
- **Cost/token meter** — per session + rolling monthly total (local), with an optional budget warning.
- **Per-task model routing** — cheap text model for task generation, strong vision model only for
  eval (already two model slots; surface presets like "Economy / Balanced / Best").
- **Provider prompt-caching** — use Anthropic/OpenAI prompt-cache headers for the static system
  prompt to cut input cost on every call.
- **Local pre-checks before eval** — compute exposure histogram, rough sharpness, and rule-of-thirds
  saliency on-device; block/flag an obviously-off shot (or grade "technical" locally) *before*
  spending a vision call.
- **Offline queue** — if submitting offline, persist the pending eval and run it automatically on
  reconnect.
- **No-key / offline fallback tasks** — a bundled library of template briefs filled from local
  context (light + weather + rig) so the core loop works with zero LLM.

### B. Coaching depth & learning
- **Progress analytics** — score trends over time per rubric dimension (is composition improving?),
  built entirely from local history. (Follow the [dataviz] guidance for the charts.)
- **Weakness targeting** — bias the next task's technique tags toward the user's lowest-scoring
  dimensions.
- **Adaptive difficulty** — nudge difficulty from recent scores (local heuristic; no server).
- **Curriculum / skill-tree mode** — a structured path (leading lines → DOF → motion → light)
  instead of only ad-hoc tasks.
- **Re-shoot & compare** — retry the same brief; show before/after scores side by side.
- **Multi-shot assignments** — photo-essay tasks (N frames, graded as a set).
- **Streaks, badges, weekly challenges** — all local gamification.

### C. Context richness
- **Golden/blue-hour planner** — "best light in 2h 10m" with a countdown; **export to Calendar
  (`.ics`)** as the reminder mechanism (no push server needed).
- **Plan-for-a-location mode** — pick a spot (map or search) to design a task for *later/there*, not
  just current GPS.
- **Sun azimuth & moon phase** — "keep the sun over your left shoulder"; night/astro tasks by moon
  phase (suncalc already gives us this).
- **Seasonal / event themes** — holidays, first snow, local events (from keyless sources).

### D. Gear
- **Full gear editor** — add/edit/delete **camera bodies** too (today only lenses are editable);
  directly answers "my phone is the wrong model" without waiting for an EXIF capture.
- **Auto-add gear from EXIF** — offer to save the exact body/lens detected in an uploaded shot.
- **Accessories** — tripod, ND, polarizer, flash as toggles that unlock task types (long-exposure
  needs tripod/ND; the feasibility guard already reasons about shutter).
- **Multiple saved rigs** — quick-switch between owned setups.
- **Expand the curated catalog** — more common bodies/lenses; keep the "unverified" badge for
  LLM-filled specs.

### E. Capture & evaluation
- **Live preview overlays** — rule-of-thirds grid, level/horizon via `getUserMedia` (desktop/Android
  first; iOS support is limited).
- **Shareable result card** — render a canvas image (photo + score + brief) and share via the Web
  Share API (works on iOS).
- **Rubric customization** — let advanced users weight the four dimensions.
- **Second opinion** — optionally evaluate with two providers and compare (costs more; opt-in).

### F. Data, privacy & resilience
- **Export / import everything** — JSON(+ZIP with blobs) backup; the only cross-device path without
  a server.
- **"Free up space"** — drop blobs older than N days, keep metadata + thumbnails (from the brief;
  now overdue given iOS eviction).
- **Storage dashboard** — show usage vs. quota and re-request `navigator.storage.persist()`.
- **Encrypt the API key at rest** — Web Crypto + an optional passcode, so a shared device doesn't
  leak the key.

### G. UX, i18n & polish
- **Onboarding** — first-run wizard (key → gear → skill → locale).
- **Home dashboard** — current light, streak, recent scores, one-tap "start session".
- **More locales** — extend the [multilingual](decisions/2026-06-21-multilingual-ui-and-tasks.md)
  base (en, da) as translations land.
- **Light mode / theming, larger-text a11y, haptics.**

### H. Engineering & quality
- **CI in GitHub Actions** — run `check`/`test`/`build` on PRs (this is dev infra, *not* an app
  backend, so it's allowed) to complement the local [pre-push hook](runbooks/build-test-deploy.md).
- **Pipeline tests with MSW** + a Playwright smoke test of the core loop.
- **Bundle-size budget** + Lighthouse PWA/a11y audits in CI.
- **Local debug/telemetry page** — surface recent LLM errors, cache stats, storage usage (no data
  leaves the device).

---

## Suggested sequencing

- **Phase 3 (next): cost & resilience.** AI response cache (Req 1) → cost/token meter → offline
  queue + no-key fallback tasks → export/import + "free up space". These protect the user's wallet
  and their data — the two things a backend would normally guard.
- **Phase 4: coaching value.** Progress analytics → weakness targeting → adaptive difficulty →
  re-shoot & compare. This is what turns a task generator into a *coach*.
- **Phase 5: reach & richness.** Golden-hour planner + `.ics` → plan-for-a-location → full gear
  editor & accessories → shareable cards → more locales.
- **Continuous:** CI, tests, bundle budget, a11y.

## Known limits to be honest about

- **No proactive reminders** without a push server; `.ics` export + in-app countdowns are the
  ceiling.
- **No cross-device sync**; export/import is the manual substitute.
- **iOS storage eviction** is real — backup tooling is load-bearing, not optional.
- **Live camera preview** is patchy on iOS Safari; treat overlays as a desktop/Android enhancement.
