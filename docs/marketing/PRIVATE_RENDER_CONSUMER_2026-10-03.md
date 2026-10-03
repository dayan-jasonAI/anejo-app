# Private render consumer checkpoint — October 3, 2026

Status: local implementation and validation. Not an application route, production schema change, deployed renderer or automatic approval. Full marketing goal remains open.

## Created and modified

The consumer in tools/marketing-render-prototype/render-consumer.mjs joins the durable actor/request job store to a real JPEG render, original-preserving output, output readback and a draft attachment transaction. Jobs bind source hash, exact canonical options, renderer version, media ID and draft timestamp revision. Final attachment checks active owner/marketing staff, unchanged draft and media, exact descriptor/fingerprint and live lease. Each attempt writes a separate object key. Attachment clears audit, schedule and prior original-caption/design evidence; it does not approve publication or alter trust grants.

Options are cloned and frozen before asynchronous work. Source bytes and metadata are reread after rendering. Lost transaction acknowledgement triggers readback of the saved job, linked draft/media and output hash; uncertain readback is reported as commit_unknown without a blind reattachment.

## Review finding and repair

Read-only independent review reproduced an expired worker attaching when batch execution was delayed beyond its lease. Capturing time before dispatch was insufficient. All three final mutation predicates now compare expiry against MAX(dispatch timestamp, database execution timestamp), using SQLite unixepoch subsec milliseconds. A NULL database clock fails closed. Constraint guards require each mutation to affect exactly one row, so a zero-row later update rolls back earlier media updates.

The regression delays actual batch execution until the lease expires without a successor, then verifies unchanged media/audit and no committed guard rows. Actual local workerd D1 separately verifies execution-clock support, rejection after expiry and complete batch rollback when a guard detects zero changed rows. Independent reviewer reran the consumer and clock tests successfully; root also verified current logs.

## Validation evidence

- npm test in tools/marketing-render-prototype: 100 tests, 99 pass, zero failures, one explicit native-base64 Node skip. Evidence: evidence/private-render-consumer-2026-10-03/prototype-tests.log.
- node --test tools/marketing-render-prototype/render-jobs-d1.test.cjs: two pass, zero failures; includes D1 constraint rollback. Evidence: d1-clock-tests.log in the same directory.
- Four existing joined content/strategy rehearsal tests pass; their provider decisions are synthetic or unavailable cases. Evidence: content-tests.log in the same directory. These tests are local continuity evidence, not live model or scheduling proof.
- Consumer integration uses the actual migrated node SQLite helper, actual library/draft handlers and pinned resvg artwork; storage is an in-memory R2 double. Tests forbid outbound fetch. Local workerd D1 clock/guard tests use the actual local D1 runtime. Two additional full consumer tests pass with actual local D1/R2 bindings: successful source/render/output/attachment and delayed-expiry rollback. Table definitions are extracted from the migrated SQLite schema; direct fixtures bypass browser authentication and exclude unrelated indexes/triggers. The consumer and resvg run in the Node test host through those bindings, not as deployed workerd application code. Evidence: d1-r2-consumer-tests.log.

## Remaining risks and approval state

No production migration, route, deployment, provider request, customer communication, charge or credentials change in this checkpoint. Existing session authorizes engineering and gated releases; this local prototype does not satisfy those release gates.

R2 and D1 cannot atomically compare source content: the last source read still precedes the database transaction. Timestamp post revision is the current app convention, not a dedicated monotonic content version. Full deployed consumer/runtime validation, production resource CPU/combined memory proof, Canvas typography parity, authenticated execution integration and owner visual acceptance remain open. Current Cloudflare plan/settings cannot yet be read behind browser sign-in. Auditor provider billing and Google approval/OAuth remain separate unresolved dependencies.

Next: close source/revision freshness and resource/parity gates, then integrate an authenticated private path without opening automatic publication. Do not treat local attachment as a reviewed, scheduled or published post.

## October 3 — stronger draft freshness and recovery boundary

Local counter/tombstone triggers replace the consumer timestamp revision; post-first transaction accounts for its own two revision increments. Recovery verifies R2 output before a final joined D1 state read. Current105tests:104pass/one explicit skip; independent consumer review19pass. See DRAFT_REVISION_FENCING_2026-10-03.md for current evidence, superseding timestamp freshness and earlier pre-readback recovery ordering. Immutable source semantics/R2-to-D1 race, deployed resource/auth/parity and full marketing readiness remain open. No production migration/deploy/trust change.
