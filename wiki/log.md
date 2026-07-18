# Log

Chronological living log of major progress, decisions, and learnings for Kameraderi. Newest entries
at the top. Use absolute dates.

---

## 2026-07-18 — Storage recovery controls

- Settings now displays the browser-reported storage estimate when available and offers an explicit
  **Free up space** control for downscaled photo Blobs older than 30, 90, or 180 days.
- Cleanup requires confirmation, retains session/task/evaluation/EXIF metadata and thumbnails, and
  protects any Blob referenced by a queued offline evaluation. It never runs automatically.
- Added deletion-policy and storage-format unit coverage. See
  [storage-recovery.md](concepts/storage-recovery.md) for the recovery boundary; versioned
  export/import remains the next resilience item.

## 2026-07-18 — Local fallback practice briefs

- Added a bundled local task path for users without an API key and for offline sessions. It uses
  the gathered light/weather context and selected rig, then passes through `enforceFeasibility` just
  like an LLM response. It makes no provider request, incurs no token cost, and is explicitly
  labelled in the session UI.
- Added unit coverage for the local source marker plus aperture and ISO limits, and documented the
  behavior in [local-fallback-tasks.md](concepts/local-fallback-tasks.md) and the manual QA runbook.

## 2026-07-18 — Explicit Android PWA installation guidance

Expanded the existing install modal's cross-browser native-prompt path with Android-aware guidance.
Android users now see a localized modal even when their browser does not expose
`beforeinstallprompt`: it explains the browser-menu **Install app** / **Add to Home screen** route.
When the native event is available, the modal continues to invoke the browser's own trusted install
dialog. iOS retains its separate Safari Share → Add to Home Screen flow; installed standalone apps
on either platform are never prompted again.

## 2026-07-18 — Recommend Adobe Project Indigo for supported iPhones

The iPhone session brief now recommends [Adobe Project Indigo](sources/project-indigo.md) over the
built-in Camera app when the selected rig is an Apple iPhone. The note links to Indigo's App Store
page and makes the intended handoff explicit: shoot in Indigo, then return to Kameraderi and upload
the original image. It is deliberately absent for every non-iPhone rig because Indigo currently has
no Android release; Android users keep their existing camera-app/upload workflow.

## 2026-07-18 — Specific iPhone model + rear-camera selection

Replaced the generic iPhone profile with an explicit, feasibility-safe phone catalog.

- Gear now has an iPhone model selector covering the iPhone 15, 16, and 17 families, including
  Plus/Air/Pro/Pro Max variants where shipped. Selecting a model exposes only its real rear cameras.
- Each rear camera is a fixed, body-compatible lens with Apple-published 35mm-equivalent focal
  length, maximum aperture, and optical/sensor-shift stabilisation. The usual capability engine
  therefore clamps briefs to the selected camera, not a fictional continuous phone zoom.
- Removed capture-time mutation of the phone profile from EXIF. The browser cannot reliably know
  the current phone's complete hardware; EXIF remains submission metadata, while the user owns the
  model choice. Existing `source: user` gear is never overwritten by catalog migration.
- Added model/camera compatibility coverage (95 tests total). Source rationale and official Apple
  specification links live in [sources/iphone-camera-catalog.md](sources/iphone-camera-catalog.md).

## 2026-07-18 — Offline evaluation queue

Completed the next Phase 3 resilience item: a submitted photo is no longer lost if connectivity
drops before its vision critique can run.

- Added Dexie v4's `pendingEvaluations` table. Queue rows reference the existing downscaled photo,
  task, submission, and unfinished coaching session — no duplicate photo data or originals — and
  retain the selected provider + vision model without storing credentials.
- Offline submissions are atomically persisted as a pending evaluation. Kameraderi resumes them
  oldest-first on app launch and whenever the browser emits `online`; a successful result completes
  the original coaching session and updates the open session view. Queueing is foreground-only,
  intentionally making no unreliable iOS background-sync promise.
- Provider/model selection is now an explicit evaluation input, which lets a queued photo use the
  chosen provider/model even if the user changes their active Settings choice before reconnecting.
- Added mocked unit coverage for atomic/idempotent queue persistence; `pnpm check` and `pnpm test`
  pass with 92 tests. Added the disconnect/reconnect walkthrough to the manual QA runbook.

## 2026-07-18 — Local token meter and install-to-home-screen prompt

Completed the next Phase 3 cost-control item and made the PWA's installation path visible in-app.

- Added Dexie v3's `usageEvents` table. Every real task, evaluation, and AI gear-lookup call records
  its input/output token counts locally; schema-validation retries record as separate calls, while
  cache hits remain free and excluded. Entries older than 60 days are swept on launch.
- Settings now shows today's and trailing-30-day token totals/call counts, offers an optional local
  rolling budget, and warns when it is reached. It is a soft warning only — it never blocks coaching.
- Added a localized install modal. iOS/iPadOS Safari users get Share → Add to Home Screen guidance;
  browsers that emit `beforeinstallprompt` receive their native installation flow. It never appears
  in standalone mode, and dismissing it is stored in IndexedDB settings rather than localStorage.
- Added install-environment unit coverage. `pnpm check`, `pnpm test` (90 tests), and `pnpm build`
  all pass. The production build retains the existing harmless Workbox glob warning for an absent
  prerendered directory.

## 2026-07-18 — Renamed Iris → Kameraderi; repo moved

Project renamed from **Iris** to **Kameraderi** (Danish *kamera* + French *camaraderie*), and the
codebase moved from `/Users/lindau/codex/photobuddy` (GitHub `simonellefsen/iris`) to
`/Users/lindau/codex/kameraderi` (GitHub `simonellefsen/kameraderi`), **preserving full git
history** (`git pull` from the old local clone into the new empty repo, then renamed on top).

Renamed throughout: `package.json` name, the Dexie database (`iris` → `kameraderi`, class
`IrisDB` → `KameraderiDB`), the PWA manifest name/short_name and `apple-mobile-web-app-title`,
localStorage keys (`iris-active-session` → `kameraderi-active-session`,
`iris-ai-cache-stats` → `kameraderi-ai-cache-stats`), the LLM system-prompt persona name ("You are
Kameraderi, …" in both `taskSystem.ts`/`evalSystem.ts`), the OpenRouter attribution headers
(`X-Title`, referer fallback), all UI copy (`i18n/messages.ts`, en **and** da), and every wiki/doc
page describing current behaviour. **Not rewritten:** older dated log entries and decision docs
that quote what was literally true at the time (they still say "Iris" where that's what shipped
then) — only living/reference docs were updated to the new name.

Old local clone at `/Users/lindau/codex/photobuddy` and the `simonellefsen/iris` GitHub repo were
left untouched (no destructive action taken); the user can archive/delete those separately if
wanted. The Vercel project deployed from the old repo also still needs to be repointed (or a new
one created) at `simonellefsen/kameraderi` — that's a manual step outside this session's reach.

## 2026-07-11 — AI response cache shipped (Roadmap Requirement 1)

Started implementing the roadmap; picked the highest-value item first. See
[concepts/ai-response-cache.md](concepts/ai-response-cache.md) and the
[design decision](decisions/2026-07-11-ai-response-cache-design.md) for full rationale.

- New Dexie tables `aiCache` + `aiCacheVariants` (schema v1→v2). Pure key derivation in
  `cache/aiCacheKey.ts` (14 new unit tests), Dexie-backed store in `cache/aiCache.ts`.
- Task generation ([taskGeneration.ts](../src/lib/pipelines/taskGeneration.ts)) and gear-spec
  augmentation ([gear/augment.ts](../src/lib/gear/augment.ts), via `runCachedStructured`) both
  check the cache before calling the provider and write validated results back.
- **Variant counter** solves the "New task should feel new" problem: `session/+page.svelte` passes
  `forceNewVariant: true` when there was already a task in this session (New task) or when
  re-tapping the currently-selected Nearby place; a plain first-generation or retry reuses the last
  variant for a free hit.
- Settings gained an "AI response cache" card: enable toggle, editable TTL (default 24h), live
  stats (entries/hits/est. tokens saved via a small localStorage counter), "Clear AI cache".
  Expired rows are swept opportunistically on app load.
- Added `.claude/launch.json` (`pnpm run dev`, port 5173) so the Browser-pane preview tool targets
  this repo instead of reusing a stale server from an unrelated project.
- Verified in-browser: Settings card renders, "Clear AI cache" round-trips through Dexie with no
  console errors, `/session` idle state unaffected. 79 tests pass (was 65), check + build green.

Not done: cost/token meter, offline queue, no-key fallback tasks, export/"free up space" — next in
Phase 3 per [roadmap.md](roadmap.md).

## 2026-07-11 — Roadmap drafted

Added [roadmap.md](roadmap.md) (linked from the index). Frames every future feature inside the
**no-backend** constraint (only browser/iOS client state — IndexedDB, localStorage, Cache API, SW,
Web Crypto; no server, no push delivery, no sync). Headline items: an **AI-response cache** (Dexie
`aiCache` table, SHA-256 key over coarsened context + rig + locale + a variant counter, configurable
TTL default 24h — wraps the provider call in the pipelines) to cut token spend, plus a themed
backlog (cost control, coaching analytics, context planners, gear editor, data export, i18n, CI).
Suggested next phase: cost & resilience (cache → token meter → offline queue/no-key fallback →
export & free-up-space).

---

## 2026-06-21 — Multilingual UI + LLM output (English / Danish)

The app now speaks the user's language — both the chrome and the LLM content. See the
[decision](decisions/2026-06-21-multilingual-ui-and-tasks.md).

- **i18n layer** (`src/lib/i18n/`): locales `en-US`/`en-GB`/`da` (`en-US` + `en-GB` share the `en`
  dictionary; differ in Intl formatting + the LLM spelling hint). `messages.ts` is a flat dotted-key
  dictionary where `en` is the source of truth and `da` is `Record<MessageKey, string>` (a missing
  key is a compile error). A reactive `t(key, params)` reads `settings.current.locale`.
- **Settings**: new `Settings.locale` + a language picker in Setup; **first run** auto-detects from
  `navigator.languages` (`detectBrowserLocale`) and persists it. Existing users keep their choice.
- **LLM output language**: `taskSystemPrompt(lang)` / `evalSystemPrompt(lang)` instruct the model to
  write all free text in the locale's language (mode-dial letters, f-numbers, brand names stay
  untranslated; eval dimension names stay fixed English as scoring keys).
- **Context strings localized at gather time**: `gatherContext(ui)` threads a `UiKey` to
  `getWeather`/`getLight`, so weather conditions + light labels render in the session language.
- **Enums localized at render** (`difficultyLabel`/`motionLabel`); the stored enum is unchanged
  (feasibility guard + CSS still key off it). History dates are now locale-formatted.
- **"Don't change existing sessions" is automatic**: tasks/evals/context are generated once and
  persisted; a locale change only affects *new* generations + live chrome.
- Tests: `i18n/i18n.test.ts` (18 cases). `pnpm check` 0 errors, `pnpm test` 65 passing, `pnpm build` ✔.

## 2026-06-21 — Eval crash fix + session persistence, camera guidance, phone self-heal

Field-test feedback round.

- **Fixed the evaluation crash** (`DataCloneError: The object can not be cloned`). `submit()` was
  passing the Svelte `$state` task proxy straight to `db().tasks.put()` / `sessions.put()`;
  IndexedDB's structured clone rejects proxies. Now snapshots with `$state.snapshot()` first (same
  pattern the settings store already documented). See [schema.md](schema.md#client-side-persistence-localstorage).
- **Active session is remembered** across reload/app-reopen via `localStorage` (`iris-active-session`),
  managed by the session store (`save()`/`restore()`, snapshot-based). The page restores on mount
  and saves via an `$effect`. (In-app navigation already survived — the store is a singleton.)
- **Beginner camera guidance.** New optional `Task.cameraSetup { mode, rationale, steps[] }` — the
  coach now says which mode-dial position to use (Av/Tv/M/Fv/P…, brand-appropriate) and how to dial
  it in. Schema + prompt + a new "On your camera" section in the task card.
- **Phone model self-heals from EXIF.** Browsers can't read the phone model, but an in-app capture's
  EXIF is the real device, so on capture we update an `isPhone` body's make/model (e.g. seeded
  "iPhone 15 Pro" → "iPhone 17 Pro"). File uploads don't trigger this (could be any camera).

Not done (needs product input): launching an external camera app (Pi/Adobe Indigo) — a PWA can't
detect installed apps, and a photo shot in another app can't return to us automatically; the only
feasible path is a user-configured deep-link button + manual re-upload.

## 2026-06-21 — Session UX: selectable Nearby, map links, badge fix

- **Badge rework.** Technique tags + difficulty were in a non-wrapping flex `.row`, so flexbox
  shrank each pill below its content width and labels wrapped vertically ("BE GIN NE R"). Added a
  wrapping `.chips`/`.chip` system (`white-space: nowrap`, `flex: 0 0 auto`) and difficulty-coloured
  chips. Also hardened `.pill`/`.badge` with `white-space: nowrap`.
- **Selectable Nearby.** Nearby places are now buttons; tapping one re-rolls the task centred on
  that place (`generateTask(rig, { context, focusPlace })` reuses the gathered context so the list
  stays stable and it's fast). New `GenerateTaskOptions`; prompt gained an optional `focusPlace`
  directive.
- **Open in Maps.** `NearbyPlace` now carries `lat/lon` (captured from the Overpass `center`/node
  coords we already fetched). `Task.destination` is set from the chosen place, or detected from a
  place named in the objective (`findMentionedPlace`). New `utils/maps.ts` builds an Apple/Google
  Maps URL (precise pin when coords exist) and `linkifyDestination` makes the place name in the
  objective a tappable link. Unit-tested in `utils/maps.test.ts`.

## 2026-06-21 — Project wiki established

Created this `wiki/` (mirroring the structure used in sibling projects): `index`, `architecture`
(Mermaid), `schema`, `concepts/`, `decisions/`, `runbooks/`, `sources/`, `experiments/`, and this
`log`. Added `AGENTS.md` and rewrote `README.md` to describe the product. Wiki content was written
against the **actual code** in `src/`, not just the design brief — notable reality vs. brief deltas:

- Product ships as **Iris** (`package.json` name, Dexie DB `iris`, PWA manifest `Iris`).
  "PhotoBuddy" remains the brief's working title.
- Deploy adapter is **`@sveltejs/adapter-vercel`** (`nodejs22.x`, SPA `ssr=false`), not
  `adapter-static` — equivalent static SPA output. No `svelte.config.js`; the adapter is configured
  inside the `sveltekit()` plugin in `vite.config.ts`.
- OpenRouter/OpenAI/Grok share one `OpenAICompatibleProvider`; Anthropic and Gemini have their own
  adapters. Registry switches on `settings.activeProvider`.
- Context layer includes a **nearby-places** source (`context/places.ts`) on top of geocode.

## 2026-06-20 — Scaffold + Phase-1 vertical slice in place

Repo scaffolded (SvelteKit + TS + Svelte 5 runes, pnpm). Present in `src/`: all domain types
(`types/`), Dexie schema v1 (`db/schema.ts`, 9 tables incl. `photos` Blob store), the five provider
adapters + registry + structured-output shaping + key validation (`llm/`), context gatherers
(`context/`: location, sunphase via suncalc, Open-Meteo weather, BigDataCloud geocode, places),
gear catalog + capability engine + augmentation (`gear/`), media pipeline (`media/`: exif,
downscale, capture, filepick), both pipelines (`pipelines/taskGeneration.ts`,
`pipelines/evaluation.ts`) with Zod validation + single retry + feasibility guard, stores, and the
five routes (`/`, `/gear`, `/session`, `/history`, `/settings`). PWA wired via
`@vite-pwa/sveltekit` (Workbox; Open-Meteo `NetworkFirst`, BigDataCloud `StaleWhileRevalidate`).

Core constraints recorded as [decisions/](decisions/README.md): client-side PWA / no backend; BYOK
multi-provider behind one abstraction; OpenRouter as the Phase-1 default; real-camera ingest via
camera roll + EXIF (WebUSB blocks camera PTP/MTP).

---

### Active / next (Phase 2)

- Gear catalog editor (add/edit body & lens); iPhone profile for phone mode.
- Validate Anthropic / Gemini / Grok adapters end-to-end with key-validation UI.
- Pre-session rig/lens picker; file-upload path for real-camera photos; EXIF GPS-vs-session
  mismatch (`geoMismatchMeters`).
- Capability engine polish: `maxApertureAt` for variable-aperture zooms, 35mm-equiv display.
- See [experiments/README.md](experiments/README.md) for model/prompt experiments to run.
