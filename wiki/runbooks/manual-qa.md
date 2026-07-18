# Runbook: manual QA (acceptance walkthrough)

The end-to-end acceptance check for a build. Run on **desktop Chrome** and **iOS Safari** (the two
platforms that exercise the most divergent code paths: file picker vs. `capture`, HEIC, storage
partitioning).

## Happy path

1. **Settings** — paste a provider key (OpenRouter by default). The key-validation badge goes
   **green**. Pick a skill level.
2. **Gear** — select the **Canon EOS R8 + RF 50/1.8** rig (Phase-1 seed).
3. **Start session** — the context card shows the correct **light phase** (e.g. golden hour),
   weather, and location name.
4. **Task feasibility** — the task's aperture / focal-length constraints are achievable on the
   50/1.8 (no f/1.4, no focal length off a prime). This is `enforceFeasibility` doing its job.
5. **Shoot & submit** — capture/upload a photo. **EXIF populates** (make/model/focal/aperture/ISO).
6. **Evaluation** — a rubric (Composition, Exposure/Technical, Constraint Adherence, Creativity)
   with rationale + an overall score comes back.
7. **History** — shows the thumbnail + score and **persists across reload** (IndexedDB).
8. **iPhone gear** — in Gear, select the exact iPhone model, then select one of its listed rear
   cameras. Confirm an iPhone 15 Pro's 77mm 3x camera is not offered after switching to an iPhone
   16 Pro, which instead offers its 120mm 5x camera.
9. **Project Indigo (supported iPhone)** — the session brief recommends Project Indigo and links to
   its App Store page. Shoot there, return to Kameraderi, and upload the original image; EXIF should
   still be populated. The recommendation must not appear for non-iPhone rigs.

## Offline / degradation

10. **Airplane mode / no key** — the app shell loads and the session/history list renders. With no
   API key, start a session and confirm the task card says it is a local practice brief. Repeat in
   airplane mode (cached context may help) and confirm no provider call is required; the brief's
   focal length, aperture, and ISO must fit the selected rig. Start a session while online, then
   switch to airplane mode before submitting a photo: the app saves a local pending critique rather
   than losing the submission. Restore connectivity with Kameraderi open; the critique should run
   automatically and appear in the session/history.

## Platform-specific checks

- **iOS Safari**: HEIC capture decodes to JPEG for eval; EXIF still read from the HEIC original.
  Installed PWA storage is separate from Safari — install once, always open the icon.
- **Android Chrome / Samsung Internet**: the install modal should offer the browser-native install
  dialog when it becomes available; otherwise it should explain the browser-menu Install app / Add
  to Home screen path. After installation, launch Kameraderi from the launcher and confirm it opens
  standalone and retains Gear/History.
- **EXIF integrity**: upload an *original* file (not a re-shared copy) — some Android share flows
  re-encode and strip EXIF.
- **RAW**: selecting a RAW file shows a helpful "not supported in Phase 1" message.
- **Quota**: only downscaled copies (~150–400 KB) + thumbnails are stored; originals are not.

## Regression net

`pnpm check && pnpm test` must pass before a build is considered shippable (see
[build-test-deploy.md](build-test-deploy.md)).
