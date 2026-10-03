# Durable render job ownership — October 3, 2026

## Outcome and boundary

Local job-store foundation created and validated. No production migration, route, scheduler, R2 write, render invocation, draft attachment, provider call, publication, trust activation or credentials changed. Technical prototype/validation scope is authorized by Dayan's existing direct-session instructions. Full goal remains incomplete.

Created render-jobs.mjs, render-jobs.sql, render-jobs.test.mjs and render-jobs-d1.test.cjs under tools/marketing-render-prototype. The SQL file creates only a local prototype table; it is not in production migrations. Module uses Web Crypto, a D1-compatible statement interface and canonical fixed-field descriptors binding source key/hash, post/media, renderer/template and options hash. Actor/request identity is immutable; exact retries return the existing job, changed descriptor conflicts. Actor-scoped atomic UPDATE RETURNING claims prevent two workers owning the same job. Fresh tokens, live expiration checks and three-attempt exhaustion fence stale workers. Rendered receipt is terminal and asserted, not proof of actual R2 bytes, attachment, auditing, approval or publication. Caller must supply trusted current timestamps. It enforces safe integer arithmetic and safe-format error codes rather than persisting raw provider text.

Source/post revisions, source provenance, real options contents, template authority and output bytes are not rechecked by this store. They must be checked by a future authenticated consumer and atomically rechecked before draft attachment. Store does not limit global concurrency or establish resource readiness. It cannot grant approval or turn on automation.

## Additional upload-read coverage

Extracted existing readBoundedBody into bounded-body.mjs without changing its behavior; resource-worker imports it. Added bounded-body.test.mjs: underreported overflow rejects despite nonsettling cancellation; exact 5 MiB accepts preserving chunk order; malformed/oversize declaration and empty body reject; excessive fragments and empty chunks reject; a stalled stream reaches the unchanged 15-second deadline and releases its reader. Deadline test uses mocked timers with a real stalled ReadableStream, not a real 15-second delay.

## Validation and evidence

Evidence: evidence/render-job-store-2026-10-03/.

- `npm --prefix tools/marketing-render-prototype test`: 84 tests, 83 passed, zero failed, one explicit native-Node base64 skip. Includes nine real SQLite job tests, one local workerd D1 test and five body tests plus existing renderer regressions; prototype-tests.log.
- SQLite tests reopen durable records and release two worker threads simultaneously against the same WAL database file. Exactly one job claim succeeds; losing claimant returns no job. Wrong actor, expired/superseded lease and post-completion mutation fail; exhaustion remains dead. Concurrency test/barrier now bounded. This is local DB behavior, not a deployed distributed proof.
- `node --test tools/marketing-render-prototype/render-jobs-d1.test.cjs`: one passed, zero failed; d1-tests.log. Actual Miniflare/workerd D1 executes schema, idempotent enqueue, descriptor conflict, competing claim, lease recovery, stale/wrong-actor rejection and terminal render receipt. No production binding or database is used.
- Four joined synthetic-provider content-flow tests passed; content-tests.log. No real model or public send.
- Local workerd body-module regression: 70 requests, 66 accepted hashes identical to preceding scratch revision, four unchanged expected rejections; body-module-workerd-measurements.json/output-comparison.json. Harness does not use the job store, so this is upload/refactor acceptance only. Resource readiness stays unverified.
- Generator --check and git diff --check passed. Application runtime unchanged; no deployment claimed.

## Dependencies and next integration

Production plan/CPU setting unknown: Cloudflare supported-browser page redirected to sign-in, Dayan was asked to sign in. CLI auth success is not plan evidence. PRODUCTION_RENDER_GATE_2026-10-03.md defines current resource proof and remaining parity/attachment requirements. No production resource gate passed.

Next safe engineering: implement private consumer rehearsal combining actual source read/hash, exact render, deterministic private output/readback and expected-source draft attachment with stale-lease fencing and audit/schedule invalidation. Keep platform resource and visual review gates independent. Only integrate/activate after applicable gates pass; preserve Dayan's full-frame authentic-emblem adaptive editorial outcome. Existing billing/API dependencies remain separate. No verified paid-order uplift.
