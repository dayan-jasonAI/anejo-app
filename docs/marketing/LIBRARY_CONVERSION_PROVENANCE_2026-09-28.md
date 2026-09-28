# Library JPEG conversion provenance — September 28, 2026

Status: locally validated, not deployed. Release remains stacked behind the unresolved Cloudflare authorization/migration gate. Owner live Hub acceptance previously redirected to login; no bypass or credential changes.

## Problem and behavior

Photos and the shared composer picker converted PNG/WebP library images through Canvas and uploaded them as ordinary originals. That discarded the stored source and AI review history. Both helpers now submit the immediate source key. The API verifies that the referenced library object exists, checks size and metadata, and inherits its recorded AI/provider/model fields. It records format conversion separately from photographic polish, rejects forged metadata and invalid/conflicting sources, and keeps derivatives out of the original-only polish path.

The picker retains the AI review gate. It calls a converted image's comparison photo its source, avoiding the false claim that an already-enhanced parent is the original. Ordinary JPEG derivatives no longer appear as photographic polish in Photos.

This is client-declared lineage, explicitly labeled in returned and stored metadata. It does not prove pixel derivation, authenticity, or that an unflagged upload was never enhanced. Existing historical conversions are not retroactively repaired. No photos are overwritten or published.

## Validation and limits

Root reviewed delegated API changes and tests, then executed the complete root suite: **3,351 passed, zero failed**. Lint: zero errors, 11 existing warnings. Functions build: compiled successfully. The retained JSON includes source SHA-256 values and command output tails.

Route tests exercise stored metadata inheritance, list readback, rejection without writes, source failure and invalid sizes, JPEG-only output, and derivative polish rejection. Client-helper tests execute both actual conversion functions under mocked Canvas/API. Picker tests exercise the visible source wording and declined review gate. These are local handler/UI tests, not live R2 or authenticated browser acceptance.

Evidence: `evidence-2026-09-28/library-conversion-validation.json`. Commands: `npm test`, `npm run lint`, `npx wrangler pages functions build --outdir /tmp/anejo-conversion-functions`.

Approval: existing direct-session implementation/release authorization applies after checks. No customer send, public post, credential change or charge. Next: release with the validated stack once provider access is restored, then verify original → enhanced PNG/WebP → JPEG → reviewed draft through the authenticated Hub. Full marketing goal remains open.
