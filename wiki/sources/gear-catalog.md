# Source: gear catalog

The curated gear data that seeds the capability engine. Canonical data:
[src/lib/gear/catalog.json](../../src/lib/gear/catalog.json), loaded via
[catalog.ts](../../src/lib/gear/catalog.ts) (`getBody`, `getLens`).

## Shape

- **bodies** — see `CameraBody` in [schema.md](../schema.md#gear-typesgearts): make/model, mount,
  sensor format + size, `cropFactor`, megapixels, `hasIBIS`, shutter + ISO ranges, `isPhone`,
  `source`.
- **lenses** — see `Lens`: make/model, mount, `isPrime`, `focalLengthMm` (prime number or
  `{min,max}`), `maxAperture: {focalLength, maxAperture}[]` (variable-aperture aware), `hasOIS`,
  optional `compatibleBodyIds`, `source`.

## Phase-1 seed

The catalog includes a small Canon seed plus a curated iPhone 15–17 camera catalog. See
[iphone-camera-catalog.md](iphone-camera-catalog.md) for its Apple-primary-source evidence and the
reason each phone camera is modeled as a separate compatible lens.

## Augmentation & provenance

Unknown gear can be filled in by the LLM ([augment.ts](../../src/lib/gear/augment.ts)) and is
tagged `source: 'llm-augmented'` with an **"unverified" badge** + edit path in the UI, because the
model can get a max aperture wrong and mis-constrain tasks. User-entered gear is `source: 'user'`.

See [concepts/gear-capability-model.md](../concepts/gear-capability-model.md) for how this data
becomes feasibility constraints.
