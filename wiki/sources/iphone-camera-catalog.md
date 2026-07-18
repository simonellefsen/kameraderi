# Source: iPhone camera catalog

The curated iPhone catalog encodes only published, photographically relevant rear-camera facts:
35mm-equivalent focal length, maximum aperture, and optical/sensor-shift stabilisation. Apple does
not publish every sensor's physical dimensions or a meaningful fixed ISO/shutter envelope, so those
shared body metadata fields are deliberately not used to distinguish iPhone task feasibility.

## Coverage

- iPhone 15 / 15 Plus; 15 Pro / 15 Pro Max
- iPhone 16 / 16 Plus; 16 Pro / 16 Pro Max
- iPhone 17; iPhone Air; 17 Pro / 17 Pro Max

The 2x and 8x entries are retained when Apple documents them as **optical-quality** options enabled
by a Fusion sensor. They are separate selectable cameras, never endpoints of a continuous zoom;
the coach consequently cannot request an in-between focal length that the phone cannot provide.

## Primary sources

- [iPhone 15 Pro technical specifications](https://support.apple.com/en-gb/111829) — 24mm Main,
  13mm Ultra Wide, 48mm 2x, and 77mm 3x camera data.
- [iPhone 16 Pro technical specifications](https://support.apple.com/en-ie/121031) — 24mm Main,
  13mm Ultra Wide, 48mm 2x, and 120mm 5x camera data.
- [iPhone 17 technical specifications](https://www.apple.com/iphone-17/specs/) — 26mm Main,
  13mm Ultra Wide, and 52mm 2x camera data.
- [iPhone 17 Pro technical specifications](https://support.apple.com/en-ie/125090) — 24mm Main,
  13mm Ultra Wide, 48mm 2x, 100mm 4x, and 200mm 8x camera data.

The catalog data itself lives in [iphoneCatalog.ts](../../src/lib/gear/iphoneCatalog.ts).
