# Preserved source versions and application protections — October 3, 2026

Current state: local implementation/tests; release not yet verified. Full marketing goal remains open. No production schema/settings/credentials changes, public posts or customer communications.

## Created and modified

Local source-versions.mjs/sql create a durable actor/request reservation bound to the selected post/media/database revision/source hash, canonical provenance metadata and fresh marketing-source-versions/ object key. Conditional create-only R2 put prevents this writer overwriting an existing object; bytes/metadata/content type are read back before confirmation. D1 binding columns and terminal rows are immutable through triggers. Confirmed identical retry reads the registered copy without recopying a changed original. Pending/ambiguous writes retain private artifacts; conflicts, stale selection, source changes and failed verification do not claim confirmation. Original files are never modified or deleted. The bounded reader enforces source size, stream fragments/empty chunks and a deadline without waiting on cancellation.

Official API checked: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ . Conditional put is a write condition; a null return alone is not a saved-copy confirmation. Actual local R2 tests verify this behavior.

Application changes: training-example deletion removes only safe training/ upload keys, preserving referenced library, studio and source-version objects while deactivating the example. The authenticated Hub media route restricts marketing-source-versions/ to MARKETING_DESK, matching library access. Tests exercise the real route for owner, marketing and kitchen roles; unauthorized kitchen access performs no storage read. All other current MEDIA writers were inspected: their generated keys use separate fixed namespaces; backup pruning is confined to backups/. This inspection is not proof that future or out-of-band writers respect the namespace.

## Validation

- Root npm test: 3,577 pass, zero failure/skip; root-tests.log.
- Root npm run lint: zero errors, eleven existing warnings; lint.log.
- Pages Functions build: compiled successfully; functions-build.log.
- Local prototype suite: 119 tests, 118 pass, one explicit native Node base64 skip; prototype-tests.log.
- Root independently ran source capture tests: fourteen pass using actual local workerd D1/R2 bindings; bindings-tests.log.

Logs reside in evidence/source-version-foundation-2026-10-03/. Coverage: concurrent capture, actor/request conflict, source byte/metadata changes, missing/tampered sources, create-only collision, lost storage/database acknowledgements, unavailable readback, private orphan retention, pending retry change, draft mutation and bounded streams.

The consumer/capture code and WASM execute in Node test host through local bindings, not as deployed workerd code. Direct fixtures omit browser capture/authentication and full application schema integration. No image is approved, scheduled or published by these tests.

## Open gates and continuation

Source-version foundation is NOT yet bound into render-job descriptors/consumer selection. It does not alone close the source R2-to-D1 race or guarantee bucket-wide immutability: another bucket writer/admin can still overwrite/delete objects. Next bind the exact confirmed version/metadata digest to jobs and final draft CAS, render the copy rather than mutable original, test changed originals and revoked/stale selections, then establish namespace writer/deletion policy and deployed authentication/resource/parity acceptance. Existing runtime source checks remain in force until that integration is completed.

Current production CPU/plan proof requires supported-browser sign-in. Auditor billing and Google API approval/OAuth remain separate unresolved dependencies. No extra authorization requested for current bounded engineering and already-authorized gated release; public automation stays closed.

## Release check correction

PR194 first renderer CI run failed before three binding-test files could load because the isolated renderer job had no root node_modules/miniflare install. Local files/test results were not invalidated, but release gates failed. CI now installs the locked root dependencies before prototype dependencies and runs the same full tests; no tests skipped or weakened. Fresh exact-head CI and deployment verification remain required. Original failing job: GitHub actions37120339528/job111195054180; error MODULE_NOT_FOUND.
