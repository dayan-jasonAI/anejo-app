# Browser photo normalization — October 3, 2026

Scope: branded-preview in the existing owner marketing page. This is an implementation and local browser acceptance record, not proof of a deployed owner save or unattended rendering.

Original library bytes/key/hash stay authoritative. JPEG and 8-bit RGB/RGBA PNG previews use a separately hashed upright PNG derivative, fitted inside 2000×2000 without enlargement or cropping. The shared bounded EXIF reader validates metadata; decoder copies remove orientation metadata before the browser applies our explicit transform. Embedded RGB profiles remain available to browser decoding, and the Canvas must report an explicit sRGB context. The receipt is `browser_declared`, never server-attested pixel conversion. Unsupported WebP normalization preserves the prior preview path and visibly declares `not_processed`. Owner visual review stays required; no trust or publication gate changes.

Bounds: original/derivative 5 MiB, original 24 MP / 8192 edge, ICC 64 KiB. Unsupported HDR/animated PNG, nonstandard PNG gamma/chromaticities, non-RGB profile headers, contradictory profile declarations and malformed EXIF/ICC framing fail. Structural ICC checks do not prove every ICC profile's semantic validity. Browser coverage is Chrome 154 on this Mac; Safari/mobile parity and broader camera profiles remain unverified.

## Evidence

`evidence/browser-normalization-2026-10-03/browser-results.json` records 20 actual browser image cases: all eight JPEG/PNG orientations, PNG/JPEG P3 conversion, alpha preservation, a rotated 12 MP resize, original hash preservation and dimensions. No failures in final run. First P3 JPEG assertion against pre-compression colors differed by five; independent Sharp/lcms sRGB decoding showed the same compressed-source difference. The final harness compares P3 against that decoded-source reference, keeping a four-level channel tolerance. This was a reference correction, not a production change or relaxed threshold.

Reproduce: `node tools/marketing-render-prototype/prepare-browser-acceptance.mjs /tmp/anejo-browser-normalization-qa`, serve only that directory on loopback, open through the supported browser, click Run acceptance, and read the visible JSON. Browser fixture/harness code is retained. Unit doubles exercise missing explicit sRGB capability, null/thrown encoding, mutable input snapshot, input limits/type rejection and honest WebP declaration. Doubles do not establish pixel behavior.

Root tests: 3,415 passing, zero failures. Focused save/declaration tests: 12 passing. Reference suite: 48 passing, zero failures. Lint and Functions build exited successfully; build output is retained alongside this record. Save tests confirm one original fetch, source hash unchanged, derivative composed, normalization receipt stored in declared options, explicit Use, stable request identity/retry, and no compose/save when normalization or hash verification fails. They do not substitute for an authenticated production Hub save/readback.

Authorization: Dayan's recorded continuing goal and deployment after release checks. Excludes public posts, customer communications, charges and credential changes. The autosync daemon recorded the initial implementation in 4ec6f76; its contents were inspected, retained, and included in the release branch. No unrelated changes overwritten.

Remaining: exact-head CI/release, deployed asset verification, authenticated owner preview/save/readback, cross-browser acceptance, unattended render runtime/resource limits and durable-job integration. The full marketing goal remains open.
