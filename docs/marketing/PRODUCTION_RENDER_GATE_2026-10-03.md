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
