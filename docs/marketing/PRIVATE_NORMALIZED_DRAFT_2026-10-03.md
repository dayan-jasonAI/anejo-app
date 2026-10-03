# Private normalized-photo draft integration — October 3, 2026

Scope: local prototype only. No application route, production migration/binding, deploy, customer send, public posting, approval, or trust activation performed. Branch `codex/editorial-runtime-resource-proof`.

## Observed change and evidence

The authenticated local Worker now captures the original photo, normalizes it through pinned resvg/lcms, persists a create-only private PNG derivative with an exact normalization receipt, composes the Reposado editorial image, and atomically attaches it to the selected draft. Version `local-private-worker-v3` distinguishes this pipeline from historical raw-render baselines. The output receipt and object metadata bind the original snapshot, normalized version, derivative hash, normalization receipt hash, normalizer version, and final image hash. All attachment mutations guard the confirmed normalized record as well as existing source/job/draft conditions.

Confirmed immutable derivative reads remain valid after an intentional draft slide replacement; they still validate original and derivative D1/R2 records and active authorized staff. Capture and capture replay still require the exact current original selection/revision. This distinction fixes the observed local post-commit recovery rejection without weakening stale attachment guards. Stale audits and schedule/design snapshots are cleared when attachment succeeds.

Evidence folder: `evidence/private-normalized-draft-2026-10-03/`. The manifest identifies source hashes. `npm test` in `tools/marketing-render-prototype` produced 211 tests: 210 passed, zero failed, one explicit Node-native-base64 skip. Actual local workerd acceptance separately passed 12/12, including owner/marketing access, both templates, P3 conversion, preserved original, no outbound requests, auth/origin refusal, server-selected overlap refusal, and uncertain execution refusal. Exact pinned Node/Worker image hashes match after normalization; that does not prove Canvas visual parity.

Receipt/deadline tests passed 24/24: strict nested normalization provenance, missing/invented/invalid fields refused, expiry checks before preflight/metadata/compression/hash dispatch. Scoped ESLint passed with the Node/Worker globals declared and existing control-character validation rule exempted. The initial unrestricted lint invocation reported environment-global errors and control-regex errors; scoped results do not claim the repository-wide lint configuration was changed.

## Remaining release gates and risks

Production readiness remains **Unverified**. Current normalization guard is 4 million pixels/5 MiB; normal phone inputs above that cap remain unresolved. Deadline checks prevent later dispatch but do not interrupt synchronous decode/color/resize or cancel pending native/provider work. Production CPU, combined peak JS/WASM/inflater/compression memory, maximum-input resource proof, deployed coordinator/backpressure and immutable writer policy are still required. The old manual resource harness/baseline describes raw v2 and must be updated for normalized v3 before reuse; no historical raw hash equivalence is claimed.

Owner visual acceptance, full library → design → current audit → owner review → schedule sandbox/live acceptance, semantic audit reliability, external channel prerequisites, and voice-device checks remain in the full execution plan. This checkpoint is a working local input-to-draft integration, not shipped unattended marketing or verified paid-order uplift.

## Next action

Update the resource harness for the v3 compiled color module, normalized schema and normalized reference output; measure maximum accepted inputs and oversized refusals under the same private Durable executor. Resolve production resource/phone-input and visual gates before promoting the pipeline to application routes.
