# Mixed-input renderer resource evidence — October 3, 2026

## Status and scope

Local prototype repair and validation only. No application route, production configuration, provider request, publication, trust activation or customer communication changed. Existing authorization covers technical repairs; this does not approve future social posts. The full marketing operational-readiness goal remains incomplete.

Previous maximum-dimension JPEG workerd coverage is recorded in EDITORIAL_RASTER_LIFETIME_2026-09-28.md and EDITORIAL_WASM_PROFILES_2026-09-28.md. This work extends it with PNGs, exact compressed-size acceptance, repeated mixed inputs and explicit memory observations. It is not the first maximum-input test.

## Created and modified

Created local-only resource-worker.mjs, resource-fixtures.mjs and resource-stress.cjs in tools/marketing-render-prototype. The worker accepts only fixed Reposado templates and bounded JPEG/PNG bodies, with no external source URL or arbitrary SVG. It enforces 5 MiB compressed size, 4 million decoded pixels, 4096-pixel edges, bounded stream chunks and a 15-second body-read deadline. Deadline/chunk limits are implemented but not exercised by the mixed-image test. No production binding is configured.

Synthetic fixtures include five maximum-pixel aspect ratios in JPEG and PNG, plus a valid PNG padded to exactly 5 MiB. Four rejected inputs cover size overflow, unsupported bytes, decoded-size overflow and empty body. Fixture bytes/hashes are declared in fixture-manifest.json; images contain no customer material. The initial named-constant-export startup failure was corrected and retained as initial-startup-failure.json.

Allocation profiling identified repeated category/bitcode array construction in the pinned JPEG encoder. Modified jpeg-encoder.mjs to use per-encoder Uint16Array bit values and Uint8Array categories (196,605 bytes combined), removing 65,534 separate coefficient arrays. Scalar coefficient writes preserve the existing Huffman writer and independent mutable encoder state. The original license remains. prepare-encoder.mjs preserves this transformation and adds a non-mutating --check command that fails on drift. Prototype test command includes the new jpeg-encoder.test.mjs.

## Validation and underlying evidence

Evidence directory: evidence/editorial-mixed-resource-2026-10-03/.

- Initial successful unsampled run: measurements.json, 70 requests in one isolate (66 accepted renders, four expected rejections); all 22 fixture/template combinations repeated three times with stable hashes. Highest sampled usedSize 276,872,924 bytes. WASM exported linear allocation 62,259,200 bytes. performance.memory unavailable.
- Matched allocation-instrumented before/after runs: sampled-measurements-before.json and sampled-measurements-after.json; comparison.json proves all 66 output hashes unchanged, same statuses and fixture/template sequence. Highest sampled usedSize changed from 231,963,092 to 116,453,636 bytes. These are observations from two local runs, not a general memory guarantee.
- allocation-summary-before.json and allocation-summary-after.json retain largest allocation nodes and hashes/paths of full raw profiles. Sampling includes objects collected by major/minor GC. Before-run cumulative sampled initCategoryNumber allocations across call paths were 438,007,308 bytes; after-run zero samples were attributed to that function. Zero samples does not mean zero allocation. Raw profiles remain in unique local temporary directories; summaries are durable, raw files may expire.
- `node tools/marketing-render-prototype/prepare-encoder.mjs --check`: passed, exact reproducibility.
- `npm --prefix tools/marketing-render-prototype test`: 62 passed, zero failed; encoder-prototype-tests.log. Includes exact byte comparison with pinned jpeg-js 0.4.4 across dimensions, patterns, quality boundaries, metadata and independent repeated outputs.
- `node --no-warnings --test test/money/reviewed-strategy-content-flow.test.js test/money/marketing-content-flow.test.js`: four passed, zero failed; content-tests.log. These remain local synthetic-provider/judge workflow checks, not live approval or provider acceptance.
- `git diff --check`: passed. No deployment performed for these local-only tools.

Reproduce: create a fresh fixture directory with resource-fixtures.mjs, then run resource-stress.cjs with that directory, optionally --sample-allocations. The harness saves partial measurements, bounds inspector/render/disposal waits and shuts down the local runtime. Use the same fixture hashes to compare implementations.

## Limits and next action

Inspector post-response heap samples and exported WASM linear memory are not additive or complete/peak isolate memory. GC and inspector instrumentation affect results. Local client wall time is not billable production CPU; successful workerd responses do not establish Cloudflare's 128 MiB combined JS/WASM budget. See https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/observability/dev-tools/memory-usage/ . Allocation sampling parameters are defined by the official Chrome DevTools protocol HeapProfiler.startSampling.

No production resource gate passes here. Source data-URI conversion remains a prominent sampled allocation site; exact production peak, CPU, concurrency, Canvas pixel/font parity, authenticated durable render jobs, lease/idempotency/storage and owner review remain open. Next bounded action: inspect source data-URI allocation and reduce copying with exact-output equivalence before a production-budget proof and job integration. No claim of a leak is established by these samples; heap dropped between some requests.

Separate owner dependencies: auditor provider billing diagnostic (actual balance/payment unknown), Google Cloud billing warning and Google API approval. No billing/credential changes made. Engineering continues independently; no verified paid-order uplift.
