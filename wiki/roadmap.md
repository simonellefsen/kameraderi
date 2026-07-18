# Roadmap

Where Kameraderi goes next. This is a living plan — reorder freely, and promote anything with real design
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

## Requirement 1 — Cache AI responses (configurable TTL, 24h default) — ✅ shipped 2026-07-11

**Goal:** stop paying tokens for responses we already have. Highest-value, done first.

### What's cached
| Call | Cache? | TTL |
|------|--------|-----|
| **Task generation** | ✅ | `Settings.aiCacheTtlHours`, user-editable (default **24h**). |
| **Gear augmentation** (lens/body specs) | ✅ | Fixed **30 days** — deterministic by make+model. |
| **Evaluation** | ➖ (not done) | Each photo is unique; no meaningful reuse case. |
| Weather / geocode / places | ✅ (already) | Handled by the service worker runtime cache. |

### What shipped
Full design + rationale: [concepts/ai-response-cache.md](concepts/ai-response-cache.md) and
[decisions/2026-07-11-ai-response-cache-design.md](decisions/2026-07-11-ai-response-cache-design.md).
In short:
- Two new Dexie tables (`aiCache`, `aiCacheVariants`; schema v1→v2) — key derivation is pure/tested
  in [cache/aiCacheKey.ts](../src/lib/cache/aiCacheKey.ts), storage in
  [cache/aiCache.ts](../src/lib/cache/aiCache.ts).
- SHA-256 (Web Crypto) key over provider/model/locale/skill/rig exactly, plus **coarsened** context
  (location grid, light phase, weather bucket, focus-place name) — see the concept page for why.
- A **variant counter** so "New task" (and re-tapping the same Nearby place) always asks for a
  *different* result while a plain repeat (retry after an error, duplicate click) is a free hit.
- Wired into [taskGeneration.ts](../src/lib/pipelines/taskGeneration.ts) and
  [gear/augment.ts](../src/lib/gear/augment.ts) (`runCachedStructured`); cache hits are
  re-validated against the current Zod schema before use.
- Settings: enable toggle, editable TTL, live stats (entries/hits/est. tokens saved), "Clear AI
  cache". Expired rows swept opportunistically on app load.

### Not done yet
- **Cost/token meter** beyond the cache's own "tokens saved" estimate (see backlog below).
- Counting expired cache rows against the "free up space" storage tool (that tool itself doesn't
  exist yet either — see Requirement/backlog item F).

---

## Requirement 2 — themes & feature backlog

Grouped by area; roughly ordered by value-to-effort within each. Nothing here needs a server.

### A. Token & cost control (pairs with the cache)
- ~~**Cost/token meter** — local daily + rolling monthly total, with an optional budget warning.~~
  Done 2026-07-18: real provider calls (including schema-validation retries) are recorded locally;
  Settings surfaces today's and rolling 30-day totals plus the optional soft limit. Cache hits are
  excluded because they make no call.
- **Per-task model routing** — cheap text model for task generation, strong vision model only for
  eval (already two model slots; surface presets like "Economy / Balanced / Best").
- **Provider prompt-caching** — use Anthropic/OpenAI prompt-cache headers for the static system
  prompt to cut input cost on every call.
- **Local pre-checks before eval** — compute exposure histogram, rough sharpness, and rule-of-thirds
  saliency on-device; block/flag an obviously-off shot (or grade "technical" locally) *before*
  spending a vision call.
- ~~**Offline queue** — if submitting offline, persist the pending eval and run it automatically on
  reconnect.~~ Done 2026-07-18: foreground-only resume runs on app launch / `online`, as required
  by browser and iOS background-work limits. See [offline-evaluation-queue.md](concepts/offline-evaluation-queue.md).
- ~~**No-key / offline fallback tasks** — a bundled library of template briefs filled from local
  context (light + weather + rig) so the core loop works with zero LLM.~~ Done 2026-07-18; see
  [local-fallback-tasks.md](concepts/local-fallback-tasks.md).

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
- **Full gear editor** — add/edit/delete **camera bodies** too (today only lenses are editable).
- ~~**Specific iPhone model selection** — select the actual phone and its real rear camera instead
  of inferring device hardware from the browser/EXIF.~~ Done 2026-07-18; see
  [the decision](decisions/2026-07-18-iphone-model-selection.md).
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
- ~~**Export / import everything** — a portable JSON backup with stored photo copies; the only
  cross-device path without a server.~~ Done 2026-07-18; see
  [portable-backup.md](concepts/portable-backup.md).
- ~~**"Free up space"** — drop blobs older than N days, keep metadata + thumbnails.~~ Done
  2026-07-18; see [storage-recovery.md](concepts/storage-recovery.md).
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

- **Phase 3 (in progress): cost & resilience.** ~~AI response cache (Req 1)~~ done → cost/token
  meter → offline queue + no-key fallback tasks → export/import + "free up space". These protect
  the user's wallet and their data — the two things a backend would normally guard.
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
