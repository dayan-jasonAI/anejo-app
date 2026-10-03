# Browser large-photo storage repair — October 3, 2026

Status: local real-browser acceptance passed; local release checks passed; remote CI/deployment pending. No deployment is established by this record yet.

The Hub browser normalizer now retries only oversized PNG output at fixed maximum edges 2000, 1600, 1280 and 1024, drawing each candidate from the original decoded image. Original byte hashes, profile hashes and once-applied EXIF orientation remain recorded. Null encoders, failed capabilities and other errors do not retry. Receipts remain browser-declared and require visual review. Server normalization resource gates remain open.

Current browser evidence is in `evidence/browser-large-photo-2026-10-03/`. Fresh Chrome 154 execution at 15:24–15:25 UTC tested 6000×4000 P3 JPEGs with orientation 6. Patches output 1333×2000, 59,798 bytes, with RGB samples matching the native reference. The complex fixture previously failed under v1; v2 produced 1067×1600, 4,354,918 bytes. Both preserve source hashes and satisfy the 5 MiB derivative bound. Complex-fixture color equality was not measured. These are synthetic real-browser preprocessing results, not production save, branding, audit or schedule acceptance.

The first file named browser-v2-patches-receipt.json contained a cached v1 run. Its contents were explicitly inspected and replaced with a fresh v2 result. The QA page now rejects a stale normalizer and uses the versioned script URL. The original v1 result and complex failure remain preserved.

Nine focused mock-Canvas tests pass, covering source mutation, refusal boundaries, non-size errors, orientation on each retry and exhaustion. Equivalent fixed synthetic fixtures are included in the normal root test suite without adding an image-library dependency. Initial isolated release checks failed because dependencies had not been installed; no release was attempted. Dependency installation and fresh checks follow, with the initial failure log retained at /tmp/anejo-browser-release-checks.log.

Dayan's direct-session authorization covers continuing engineering and deploying after existing checks pass. No new public post, message, charge, credential, trust activation or database update is included. Full marketing objective remains open: production photo-to-draft-to-audit-to-owner-review-to-schedule evidence, trustworthy audit provider responses, unattended resource proof, team/Ana/voice acceptance and external channel prerequisites.

Rollback: revert the normalizer and its single cache-version change; original photos are unaffected. Validation and any release receipt must be appended before claiming live completion.

Local isolated release checks: 3,597/3,597 root tests passed, npm lint exit 0, Wrangler 4.129.0 Pages Functions build successful and predeploy ancestry guard passed. Logs: /tmp/anejo-browser-release-checks-v2.log and /tmp/anejo-browser-release-lint.log.
