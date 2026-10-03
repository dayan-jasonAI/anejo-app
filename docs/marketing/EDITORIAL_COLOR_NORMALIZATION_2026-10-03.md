# Reference photo normalization — October 3, 2026

Authorized internal implementation on `codex/editorial-color-normalization`; root owns integration. This is a Node-only reference preprocessor and opt-in local preview path. No app imports it; no live library, original photo, production data, trust setting, provider generation or public post changed.

The candidate snapshots input bytes before awaits (including Buffer callers), parses bounded JPEG/PNG orientation and ICC metadata, rejects conflicting or malformed profiles, and explicitly converts RGB to sRGB. It emits a lossless, upright PNG derivative, preserving alpha and removing EXIF/XMP/GPS. Input supports JPEG and 8-bit RGB/RGBA PNG up to 5 MiB, 24 MP and an 8192-pixel edge. Inside-2000x2000 downsampling preserves the full frame; no enlargement. Derivatives retain the compositor's separate 5 MiB limit. HDR, animated PNG, CMYK, high-depth and unsupported gamma/chromaticities are rejected rather than silently changed. HEIC and camera RAW are not supported by this reference path.

Receipt records separate original/derivative hashes, original orientation/dimensions, source profile hash, explicit embedded RGB profile versus declared/assumed sRGB, output profile hash, dimensions/resize policy, and Sharp/libvips/lcms versions. The receipt describes local preprocessing; it is not a trusted production rendering attestation. Historical EXIF still requires visual review.

Sharp's fulfilled conversion promise alone is insufficient: warnings and decoder/profile disagreements reject the operation. Dependency audit identified the older codec bundle; isolated Sharp is now pinned to 0.35.5. Current local receipt records libvips8.18.7/lcms2.19.1. Prototype dependency audit reports zero vulnerabilities; this is not a whole-repository audit.

## Validation and actual artifacts

`npm test --prefix tools/marketing-render-prototype`:43/43 passed. Coverage includes actual P3→sRGB reference colors and their WASM raster, all eight PNG/JPEG orientations, exact alpha preservation, metadata removal, duplicate/conflicting/invalid ICC, a structurally valid but unconvertible TRC profile, concurrent Buffer mutation, derivative byte overflow, repeated hashes, and a 4000x3000 rotated phone-photo fixture resized to1500x2000 without cropping. A separate reviewer reproduced the Buffer hash invariant after the fix, and root reran that probe. Its script remained temporary; the regression is durably included in normalization.test.mjs.

`node tools/marketing-render-prototype/preview-editorial.mjs --normalize-source` generated two actual editorial JPEGs from the existing website theme asset. Their source is not independently verified event photography. The original1448x1086 source remains unchanged; its normalized derivative is3,235,783bytes with a separate hash. Actual JPEGs, receipt and source hashes are in `evidence-2026-10-03/color-normalization`.

Ten deterministic local workerd renders of the existing JPEG fixture passed after the bounded-dimension helper change. These runs exercise the existing compositor, not native Sharp inside workerd. Peak memory, billable CPU, concurrent/deployed behavior and production safety remain Unverified. `git diff --check` passed. A dedicated GitHub CI job now installs the isolated locked dependencies and runs the full prototype suite on Node24/Linux; release results are appended after inspection.

## Boundaries and next action

Native Sharp is not a Cloudflare Worker dependency. The next production decision needs a validated browser preprocessing or Worker-compatible normalization path, plus resource and visual acceptance and durable job integration. Browser receipts cannot inherit Node/Sharp evidence. AdobeRGB reference fixtures, broader JPEG ICC segment ordering and browser/Node parity remain open; no all-profile correctness claim. Current Canvas/WASM lettering/halo differences remain open. Existing publishing trust gates remain off.

No additional owner approval is needed to continue internal work. No charge, customer communication or credential change occurred. Rollback is a source revert; no migration.

Primary API reference: https://sharp.pixelplumbing.com/api-output/#withiccprofile . Installed source and reproducible fixtures, rather than current docs alone, support implementation claims.
