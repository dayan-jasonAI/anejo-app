# Production renderer gate — current findings, October 3

Scope: read-only configuration, supported Cloudflare browser access and official documentation. No secrets opened, credentials changed, plan purchased, configuration altered or benchmark deployed.

Observed repository wrangler.toml: Pages application, compatibility date 2026-05-01, no explicit CPU limit or plan designation. Installed Wrangler 4.129.0 whoami succeeded for the existing account. CLI authentication does not establish a plan. Normal Chrome navigation to the account Workers plans page redirected to Cloudflare sign-in. Root did not click the sign-in flow accepting displayed terms; Dayan was asked to sign in, and the tab marked for handoff. Current production plan/CPU setting remains Unverified.

Official sources read October 3:
- https://developers.cloudflare.com/pages/functions/pricing/ : Pages Functions requests count toward Workers plan quota, paid Pages supports Standard usage.
- https://developers.cloudflare.com/workers/platform/limits/ : 128 MB per isolate including JS/WASM; free HTTP CPU 10 ms, paid default 30 seconds with configurable maximum. CPU and wall time differ. Memory overflow can let current requests complete while recycling the isolate; invocation outcome exceededMemory/error1102 are important observations. Do not infer budget from a 200 response or an account's authentication.
- https://developers.cloudflare.com/workers/observability/dev-tools/memory-usage/ : local DevTools profiling can locate allocations; it does not turn the current post-response samples into a deployed peak-memory proof.

## Required acceptance before automatic rendering

1. Read current account plan and actual relevant execution CPU settings; do not purchase/change them as part of inspection. If unknown, keep gate closed.
2. Package the exact current renderer/assets in an authenticated internal/draft-only execution path. The unauthenticated local resource-worker must never be deployed as-is. No provider-generated designs, publication or customer-facing mutation in benchmark.
3. Use original-preserving synthetic maximum-input cases with both approved Reposado profiles; record source/options/renderer hashes and verify output bytes/shape. Include cold and sequential runs, bounded consumer concurrency and source changes. Preserve prior output-equivalence evidence.
4. Capture actual platform CPU and invocation outcomes through authorized supported logs/metrics. Record exhausted CPU/memory outcomes and isolate resets separately; completion alone does not establish headroom. Establish an appropriate total/peak-memory method or explicitly retain the missing proof, never sum unrelated inspector fields. Local wall timing is not production CPU.
5. Close Canvas typography/image parity and owner visual review separately. No simpler template substitution solely to satisfy budget.
6. Establish atomic actor/request identity, bounded leased attempts, stale-worker fencing, source/options/post rechecks, original-preserving output key, R2 readback and atomic draft attachment with audit/schedule invalidation. A rendered job is not an attached/reviewed/published post. Resource gates remain independent of logical job-store tests.

Safe parallel work: local SQLite/D1-compatible job-store foundation and race/recovery tests without production schema/routes. Browser sign-in and billing/API dependencies do not block that work. Full marketing scope remains unchanged and incomplete.

## October 3 — private consumer and execution-time lease repair

Local consumer joins original source, pinned render, output readback and atomic draft attachment with audit/schedule invalidation. Independent review reproduced and root repaired delayed-batch lease expiry; 97 prototype tests pass/one explicit native Node skip, two local workerd D1 clock/guard tests pass. Evidence and exact limits: PRIVATE_RENDER_CONSUMER_2026-10-03.md. Complete consumer currently uses migrated SQLite plus R2 double; full D1/R2/runtime resource/parity acceptance and authenticated app integration remain open. No deployment, production schema or trust change. Full goal remains open.

Additional local binding acceptance: root independently ran both complete-consumer D1/R2 cases successfully. Full prototype now99pass/one explicit skip (100tests). Actual storage/database bindings replace doubles in these two cases; consumer/WASM execute from Node host and direct fixtures bypass browser auth. This does not establish deployed resource or authenticated runtime proof. Evidence: PRIVATE_RENDER_CONSUMER_2026-10-03.md and d1-r2-consumer-tests.log.

## October 3 — stronger draft freshness and recovery boundary

Local counter/tombstone triggers replace the consumer timestamp revision; post-first transaction accounts for its own two revision increments. Recovery verifies R2 output before a final joined D1 state read. Current105tests:104pass/one explicit skip; independent consumer review19pass. See DRAFT_REVISION_FENCING_2026-10-03.md for current evidence, superseding timestamp freshness and earlier pre-readback recovery ordering. Immutable source semantics/R2-to-D1 race, deployed resource/auth/parity and full marketing readiness remain open. No production migration/deploy/trust change.

## October 3 — preserved-source foundation and narrow application safeguards

Local actor/request/source-version capture and conditional create/readback pass fourteen actual D1/R2 tests; prototype118pass/one explicit skip. Training deletion now confines cleanup to training uploads and Hub source-version media requires MARKETING_DESK; root3,577tests/lint/build pass. Evidence: SOURCE_VERSION_FOUNDATION_2026-10-03.md. Release pending; capture is not yet consumer-bound or bucket-wide immutable. Next exact version/job/CAS integration plus production resource/auth/parity gates. Full goal remains open.
