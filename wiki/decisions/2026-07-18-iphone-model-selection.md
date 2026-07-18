# Decision: select a specific iPhone model and camera

**Date:** 2026-07-18  
**Status:** accepted

## Context

A web app cannot reliably identify the hardware of the iPhone currently running it. A photo's EXIF
may describe the device that captured that photo, but it is not a trustworthy source for the
running device or its complete camera system. The prior generic `iPhone` catalog profile therefore
could produce a brief that was feasible for one iPhone but not another.

## Decision

- Gear presents a dedicated **iPhone model** selector. The curated catalog initially covers the
  iPhone 15, 16, and 17 families, including their Plus/Air/Pro/Pro Max variants where Apple ships
  them.
- Each rear camera is a discrete, body-compatible lens rather than a fabricated continuous zoom.
  The user selects the camera they intend to use (for example, 13mm Ultra Wide, 24mm Main, or
  120mm Telephoto) before generating a task.
- The catalog stores Apple-published 35mm-equivalent focal length, aperture, and optical/sensor
  shift stabilisation for every selectable camera. The normal `rigCapabilities` and
  `enforceFeasibility` path remains the sole feasibility authority.
- EXIF remains useful feedback about an uploaded photo, but it must not silently replace the user's
  selected iPhone model.

## Consequences

- A device model and its cameras are intentional user-owned gear data, just like a Canon body and
  lens. The browser never claims that it discovered hardware it cannot access.
- A broader phone catalog can use the same `Lens.compatibleBodyIds` mechanism. Existing user-created
  lenses remain unrestricted unless they explicitly supply that field.
- Catalog updates only overwrite rows still marked `source: 'catalog'`; user-entered profiles stay
  untouched.
