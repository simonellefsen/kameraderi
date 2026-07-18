# Concept: local fallback tasks

Kameraderi's core coaching loop should not become a dead end just because the user has not added an
LLM key or has temporarily lost connectivity. A small bundled template library creates a useful
practice brief from data already available on-device.

## When it runs

- The active provider has no API key.
- The browser reports itself offline before task generation begins, or connectivity is lost while a
  provider task is being requested.

Location remains required because the brief is still here-and-now. `gatherContext()` already
degrades weather, place lookup, and reverse geocoding independently, while sun/light calculation is
local.

## What it produces

The templates vary with light phase (daylight, golden hour, blue/twilight, night) and are
localized with the rest of the UI. They use the selected rig's focal range, fastest aperture,
stabilization, and ISO limits, then pass through `enforceFeasibility` exactly like an LLM task.
They are marked `generationSource: 'fallback'` and visibly labelled **Local practice brief** so the
user is never misled about their origin.

## Boundaries

- It is a short, intentionally conservative practice prompt, not a substitute for a contextual LLM
  coach. It never invents nearby places or weather-specific claims.
- It costs no tokens, makes no provider request, and is not stored in the AI response cache.
- Photo evaluation still requires a configured vision provider. An offline submission is preserved
  by the pending-evaluation queue and can complete after a key/connection becomes available.
