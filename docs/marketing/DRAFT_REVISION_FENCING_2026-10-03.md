# Draft revision and recovery boundary — October 3, 2026

Status: local prototype implementation, tested and reviewed. No production migration, rendering route, deployment, trust activation, customer communication or credentials change. Full marketing goal remains open.

## Changes

Added tools/marketing-render-prototype/draft-revisions.sql, installed locally after the application schema. A separate persistent post-id revision register advances on every post insert/update/delete and media insert/update/delete. Media moves advance both affected posts. Tombstones remain after deletion, preventing a recreated post ID from inheriting the old generation. Integer/maximum-safe constraints reject overflow atomically. This is conservatively broader than content edits: audit-only changes also invalidate a pending render.

The local consumer now binds descriptor postRevision to that database counter, replacing its earlier timestamp meaning. Consumer ordering is post compare-and-swap/invalidation first (revision advances once), then media replacement (advances again), then job completion requiring exactly revision+2. The three mutation guards and execution-time lease fence remain. Actual local workerd D1/R2 success verifies the counter advances exactly twice; the expired-batch case verifies trigger changes roll back with the attachment.

Independent review reproduced a further false verified-state boundary: editing a caption while the final R2 read awaited could occur after earlier database checks. Recovery now verifies output first, then performs a single joined job/post/media/revision read, checking exact receipt, fingerprint, rendered state, linkage and revision. An edit during readback returns commit_unknown/attached unverified. This is proof at that observed boundary, not a promise that no later edit can occur.

## Validation

Command: npm --prefix tools/marketing-render-prototype test. Current result: 105 tests, 104 pass, zero failures, one explicit native-base64 Node skip. Current log: evidence/draft-revision-fencing-2026-10-03/prototype-tests.log.

Regression coverage includes the actual social edit handler followed by restoring the same timestamp; slide reordering without timestamp changes; delete/recreate tombstones; revision overflow; edit during output readback; previous lease/source/actor/rollback/recovery cases. The first tombstone fixture attempt failed the real foreign-key constraint because its slide still existed; the fixture was corrected to delete its child slide before deleting/recreating the test post. The final suite passes. Independent read-only reviewer reran 19 consumer/D1-binding tests successfully; root reviewed current logs and implementation.

The Node consumer/WASM test host uses actual local workerd D1/R2 bindings in two cases. Direct fixtures and extracted table definitions do not establish browser authentication, full deployed schema/runtime or production CPU/combined-memory headroom. Revision SQL is a local prototype, not a production migration.

## Source freshness remains open

A final source hash/metadata read cannot atomically protect a mutable R2 source across a D1 attachment. The next implementation needs immutable source-version semantics: copy the selected exact bytes/provenance into a fresh private version object, verify readback, register version key/hash/metadata digest in D1, and bind the selected version to the job/approval. Replacement creates a new version and changes the D1 selection; no version overwrite or referenced-version deletion is allowed.

Current paths usually create fresh keys but use unconditional puts; branded-save retries can overwrite deterministic request keys, and training-example deletion can delete its stored media key. Before claiming immutability, enforce one reviewed write/delete policy across every applicable writer or isolate version storage with reviewed access controls. An ETag/version observation or another HEAD is insufficient. Out-of-band bucket administrator changes remain outside application guarantees. Originals must remain accessible and unmodified.

## Continuation

Current Cloudflare plan/CPU verification requires supported-browser sign-in; auditor billing evidence and Google API approval are separate dependencies. Continue safe immutable-source integration design/tests and remaining team operational acceptance while those are pending. No smaller design substitution to satisfy resource tests; retain full-frame approved Reposado and authentic emblem. Automatic publication remains closed.
