# Authenticated private Worker rehearsal — October 3, 2026

Status: local implementation and full-runtime validation. Not deployed, not an app route, not a production migration, not a publication approval. Full marketing operational readiness remains incomplete.

## Implementation

private-draft-worker.mjs packages the current renderEditorial compositor, authentic emblem, pinned editorial fonts and resvg WASM. It accepts only localhost/127.0.0.1 and requires a server-owned LOCAL_RENDER_REHEARSAL binding. Existing requireRole/MARKETING_DESK authentication resolves the current active staff roster from D1; actor identity never comes from request JSON. POST requires exact same-origin Origin, JSON content type, strict fields, a streamed16KiB/3second/128chunk limit, and the actual renderer's80/50character title/kicker caps.

The request binds the selected draft/slide/revision/source key/hash and exact profile/wording. Actor, capture-version metadata, renderer identity, assets and execution time are server derived. Within workerd, it captures and confirms an original-preserving version, enqueues an actor/request-bound job, claims that exact job, renders, verifies output and atomically attaches only to the current eligible draft with prior audit and schedule invalidated. A repeated rendered request reports already_rendered with current attachment unverified; it does not silently rerender or claim current approval. Changed request fields conflict. The whole flow has a per-isolate single-request reservation and releases it in finally; this is not a global concurrency guarantee.

No live session/cookie, credential, provider call, public post, customer communication, production configuration or database change occurred. Fixture sessions are synthetic and confined to local KV.

## Evidence

Root full suite: npm --prefix tools/marketing-render-prototype test —144tests,143passed,zero failed,one explicit Node-native base64 skip. Full log: evidence/authenticated-private-worker-2026-10-03/prototype-tests.log. git diff --check passed. input-manifest.json records current module/fixture/font/emblem/WASM hashes. The application root suite was not rerun because this checkpoint changes only isolated local tooling; historical results are not claimed as current app or production evidence.

Nine new tests execute the entire handler/compositor/consumer inside a bundled workerd Worker with actual local D1/R2/KV bindings. They verify owner and marketing success for both Reposado profiles; JPEG hash/dimensions and provenance; originals retained; attachment/revision changes and old audit/schedule clearing; repeat request without another output; exact new-job execution leaving an older job untouched; missing/expired/inactive/forged-role sessions, kitchen role, cross/missing Origin, malformed/extra/invalid inputs without source/job writes; and fail-closed missing binding/nonlocal hostname. The older HTTP queue test deliberately seeds a bookkeeping-only older job; full valid older-job selection is separately covered by the consumer tests.

Both profile JPEG hashes match the same pinned Node renderer for the fixture. This establishes that runtime comparison, not Canvas typography/halo parity, real launch-photo acceptance or all-image equivalence.

The first overlap test incorrectly assumed concurrent HTTP dispatch would always overlap; root observed200/409 because the second request could start after attachment. The revised test uses a test-only outer wrapper/local service barrier before the first actual R2 source read. The handler and renderer are unchanged, actual storage reads resume after release, the overlapping request returns429, and a fresh eligible request succeeds after release. This verifies the per-isolate reservation deterministically. It does not prove distributed execution or production resource headroom. All other tests execute through a pass-through wrapper with no barrier. OutboundService was disabled and its observed request list stayed empty.

## Remaining gates / next action

Current production plan/CPU budget, actual deployed invocation outcomes/peak isolate memory, cross-isolate concurrency/backpressure, bounded overall execution, bucket-wide writer policy, source ICC normalization, Canvas/approved-design visual acceptance, production schema/auth integration and customer-facing workflow acceptance remain open. The compositor retains existing experimental visual differences and always requires human review. Local host/binding gates must not be removed to ship before those independent gates close. No simpler design was substituted to make the tests pass.

Continue with current supported Cloudflare account/plan inspection and maximum-input complete-worker resource evidence; then production draft integration and owner visual review. Auditor billing/API failure, Google billing warning/API approval and remaining team/Ana/voice surfaces remain separate dependencies. Existing authorization covers engineering and gated deployment; no new approval requested for this local work. This is progress in the full goal, not completion of it.
