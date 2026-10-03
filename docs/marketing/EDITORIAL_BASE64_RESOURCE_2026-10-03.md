# Editorial image conversion and scratch storage — October 3, 2026

## Outcome and approval boundary

Local-only prototype modifications, not deployed or integrated with automatic jobs. Technical repair scope is covered by Dayan's direct-session authorization. No new provider call, billing change, trust credit, publication or customer communication. The full goal remains open.

Created base64.mjs and base64.test.mjs. core.mjs/editorial.mjs use the helper instead of expanding typed-array bytes through String.fromCharCode and building a full binary-string copy. Native Uint8Array.toBase64 is feature-detected; the fallback directly maps byte triples to canonical padded base64 in 12 KiB input chunks, respecting offset views and modulo-three tails. A full final base64 output is still required by the existing SVG decoder; this is not streaming image decoding. The official API specification is linked at https://tc39.es/proposal-arraybuffer-base64/ . No production runtime support inferred from documentation.

Changed five per-encoder JPEG scratch arrays: Int32Array for coefficients already coerced with |0; Float64Array for DCT channel buffers preserving Number precision. Existing algorithm, Huffman tables, metadata, independent mutable state and license retained. prepare-encoder.mjs reproduces the adaptation exactly; --check passed after accounting for the new comments. package.json includes the new tests. resource-worker.mjs records which encoding path is exposed/selected in the local runtime.

## Validation evidence

Evidence directory: evidence/editorial-base64-resource-2026-10-03/.

- Full helper/prototype tests before scratch revision: 67 passed, zero failed, one native-Node test skipped (Node v24.16.0 lacks toBase64); prototype-tests.log. Fallback always exercised against Node Buffer, including all byte values, empty/modulo-three/chunk boundaries, offset views, 5 MiB and no mutation. Native runtime support is separately observed below.
- After scratch revision: 68 passed, zero failed, same one explicit native-Node skip; scratch-prototype-tests.log. Exact pinned jpeg-js 0.4.4 byte comparisons extended with many-block inputs and fractional quality thresholds. Four synthetic-provider content flow tests passed at both checkpoints; base64-content-tests.log and scratch-content-tests.log.
- Two new local 70-request workerd runs: 66 successful renders plus four expected rejections each. All 66 accepted output hashes match the preceding typed-lookup-only baseline and each other. Both local workerd runs report native base64 encoding; actual output hash comparison covers that runtime path. Source/template/request statuses match.
- Native-only change: highest sampled usedSize 147,857,328 bytes versus baseline 116,453,636; NOT a demonstrated peak/live-memory improvement. Sampled cumulative allocations including collected objects changed from 5,369,466,712 to 1,365,262,008 bytes across the full run. This is sampled allocation churn, not retained or peak heap.
- Subsequent scratch-buffer run: highest sampled usedSize 88,628,340 bytes, cumulative sampled allocations 1,382,026,980. Again, these are two observed local runs, not a production bound or causal guarantee. Inspector/GC can affect observations. WASM linear allocation remains separately observed, never summed to infer total memory.
- comparison.json, measurements.json, scratch-measurements.json and allocation-before/after/scratch.json contain source records, observations and raw-profile hashes/temporary paths. Full raw profiles may expire; compact summaries are committed. No concurrency, actual production CPU, deployed cold start, all-inclusive peak memory or Canvas parity proof.
- Generator --check and git diff --check passed. These files are local prototype/harness/test paths, so no application build, release or deployment claimed.

## Continuity and next action

Previous turn was progress: code, tests and resource evidence changed. This turn also changes authoritative code and evidence. Automatic rendering remains gated. Next: verify current production execution plan/budget and an appropriate combined-memory/CPU acceptance method, then close typography/pixel parity and authenticated durable draft-only job ownership, storage, retry/idempotency and owner review. Do not repeatedly optimize merely to get a lower inspector sample or silently substitute a simpler visual template for Dayan's approved design.

Separate dependencies: auditor billing cause is a saved provider diagnostic, actual balance/payment unknown; Google Cloud emailed a billing warning October 1, resolution unknown; API approval/OAuth/integration are separate unverified states. No credentials/payment changes. No paid-order uplift verified. These do not prevent remaining safe engineering work.
