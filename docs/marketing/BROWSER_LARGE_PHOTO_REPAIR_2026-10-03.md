# Browser large-photo storage repair — October 3, 2026

Status: browser repair merged and deployed; local large-photo tests and an existing live private-draft preview/save check passed. Full marketing readiness remains open.

The Hub browser normalizer now retries only oversized PNG output at fixed maximum edges 2000, 1600, 1280 and 1024, drawing each candidate from the original decoded image. Original byte hashes, profile hashes and once-applied EXIF orientation remain recorded. Null encoders, failed capabilities and other errors do not retry. Receipts remain browser-declared and require visual review. Server normalization resource gates remain open.

Current browser evidence is in `evidence/browser-large-photo-2026-10-03/`. Fresh Chrome 154 execution at 15:24–15:25 UTC tested 6000×4000 P3 JPEGs with orientation 6. Patches output 1333×2000, 59,798 bytes, with RGB samples matching the native reference. The complex fixture previously failed under v1; v2 produced 1067×1600, 4,354,918 bytes. Both preserve source hashes and satisfy the 5 MiB derivative bound. Complex-fixture color equality was not measured. These are synthetic real-browser preprocessing results, not production save, branding, audit or schedule acceptance.

The first file named browser-v2-patches-receipt.json contained a cached v1 run. Its contents were explicitly inspected and replaced with a fresh v2 result. The QA page now rejects a stale normalizer and uses the versioned script URL. The original v1 result and complex failure remain preserved.

Nine focused mock-Canvas tests pass, covering source mutation, refusal boundaries, non-size errors, orientation on each retry and exhaustion. Equivalent fixed synthetic fixtures are included in the normal root test suite without adding an image-library dependency. Initial isolated release checks failed because dependencies had not been installed; no release was attempted. Dependency installation and fresh checks follow, with the initial failure log retained at /tmp/anejo-browser-release-checks.log.

Dayan's direct-session authorization covers continuing engineering and deploying after existing checks pass. No new public post, message, charge, credential, trust activation or database update is included. Full marketing objective remains open: production photo-to-draft-to-audit-to-owner-review-to-schedule evidence, trustworthy audit provider responses, unattended resource proof, team/Ana/voice acceptance and external channel prerequisites.

Rollback: revert the normalizer and its single cache-version change; original photos are unaffected. Validation and any release receipt must be appended before claiming live completion.

## Release and live evidence — 15:35–15:40 UTC

PR196 merged to main at 15:35:19 UTC as 8a54379d3a298e65146650a153f5f8e9c523b537. All four exact-head checks passed (Functions, Hub React, reference renderer and Pages). Production deployment d2bb461e-7e25-4e2f-9a4b-6d19d544b5bb records source 8a54379. Live normalizer returned HTTP200 and its SHA256 equals the tested release: b4694450e5267bf0080f849da2a4343e3d34d293395864ba45631d873134f7ba. Normal supported authenticated Chrome loaded the browser-srgb-2 URL.

Existing private QA draft sp_c4df45a9d885d7dad754 rebuilt its branding preview from the preserved source. The owner-authorized private save replaced its single slide; after reload its 1254×1254 render-receipt media reference remained identical. Evidence: live-private-draft-persistence.json and live-private-draft-saved.png. This is not a 24 MP production-storage test, visual owner approval, complete launch-carousel acceptance, audit, schedule or publication. No public/customer communication or trust activation occurred.

General verify:live completed with two explicitly skipped checks (including live DB). verify:deploy could not read deployment metadata because its named API environment variables were unset; its exit0 is NOT proof. Separate authenticated Wrangler provider inventory and exact live asset hash supply release evidence for this narrow scope. Logs are retained here. Instagram currently refuses its configured connection; refresh credentials is owner work. The full server resource, audit-provider, end-to-end scheduling, Ana/voice and external integration gates remain open.

Next: join current launch-carousels to a trustworthy finished-image audit and owner review, prove current scheduling gates without publishing, and continue deployed unattended resource validation. No new approval needed for safe engineering.
