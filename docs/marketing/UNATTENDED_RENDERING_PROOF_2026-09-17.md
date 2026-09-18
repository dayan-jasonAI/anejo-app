# Deterministic marketing rendering: bounded read-only gap review

2026-09-17. Repository: `/Users/aiagent/Dayan Workspace/Aether/anejo-app`. No source edits, provider calls, deployment or new resource provisioning. This is an architecture recommendation from inspected code and existing local artifacts, not production readiness.

## Finding

The existing Cloudflare execution family can run a deterministic WASM rasterizer **in a local workerd harness**. `tools/marketing-render-prototype/output/workerd-benchmark.json` records ten sequential200JPEG responses with identical SHA256 and315.9–608.9ms local wall duration. `output/build-results.txt` and README record successful standalone Worker dry-run, gzip2097.09KiB. This demonstrates a feasible local mechanism, not that the currently deployed Pages app already supports safe automatic rendering.

The approved application's existing runtime has D1, R2 and normal Functions, but no browser DOM/Canvas or configured browser-rendering binding in `wrangler.toml`. Root `package.json` does not install resvg/jpeg-js. Prototype package/configuration are separate and deliberately not imported by production. Existing renderer `public/hub/owner/assets/marketing-branding.js` requires document, Image, Canvas2D, document.fonts and JPEG dataURL; it cannot simply run inside the current planner Worker.

## Smallest practical route

1. Continue deterministic reuse of **already reviewed finished designs** through the existing asset registry/attachment path when a matching composition exists. This is the smallest working automatic draft path; it does not create a new template image.
2. For genuinely new renders, integrate **one fixed reviewed template**, not the entire adaptive Canvas engine, after an isolated Pages-specific build/resource proof. The existing resvg WASM + pinned TTF + Uint8Array JPEG encoder is the smallest candidate implementation requiring no new image-generation provider. Keep runtime/binding changes isolated and subject to release checks; unknown CPU/memory plan limits require verification before deployment or activation.
3. Template input contract: exact registry source key/revision/hash, normalized JPEG/PNG with explicit orientation/color-space handling, fixed template ID/version, short sanitized text, bundled canonical emblem hash, font hash, and reviewed protected/clear area metadata. The model can choose a listed tuple and wording; it cannot supply SVG, URLs, arbitrary coordinates or a safety certificate.
4. A durable private render-job row records input snapshot, deterministic idempotency key, state, lease/attempt, timestamps/error and output hash. One render per claimed job; retries reuse an already verified artifact. Recheck approved source revision/hash and unchanged empty draft before attaching. Use a new private R2 derivative key, retain source, and store source/template/font/emblem/output hash provenance. An R2 put followed by failed DB attach is a private orphan, not success; reconcile explicitly.
5. Attachment must use the same race-safe draft restrictions as `marketing_asset_attachment.js`, remain unscheduled, invalidate audit/clean-trust evidence and require final-image audit + owner review. Never translate rendering success or source-library opt-in into publication consent. Existing live scheduler, customer replies and publishing stay out of this operation.

## Blockers before application integration

- **Runtime/resource proof:** successful prototype Worker bundling is not Pages bundling. Existing NodeRSS183–342MB is not isolate measurement and is concerning enough to require explicit production-limit analysis. Need bounded maximum input stress, retained-memory/cold-start/consecutive-job behavior and deployed CPU budget evidence. Existing local durations are not billableCPU measurements. Avoid parallel renders until measured safe; no free-plan10msCPU assumption.
- **Visual divergence:** prototype `core.mjs` contains one1080×810 fixed template, solid contain background and fixed lower-edge title/emblem. Browser engine has multiple Reposado profiles, protected-region logic, contrast sampling, mark tinting and adaptive typography. Prototype uses text `#f8f0df` and background `#e6d5b9`; these are not the browser BRAND_INK palette. It therefore does not yet reproduce the approved shared design system. Share versioned layout tokens/math or implement golden parity fixtures before presenting it as the production template engine.
- **Typography/food clearance:** prototype only bundles CormorantGaramond; browser also uses JosefinSans. Forty-character length limit is not glyph-width fitting and cannot establish no overflow. No protected-food collision or contrast validation in prototype. Need visual golden tests on representative real library photos, long/narrow/wide/accented Spanish headings, packaging text and all intended source aspect ratios. Fixed reviewed source/template pairs are safer than claiming semantic image understanding.
- **Input correctness/security:** no EXIF rotation/ICC pipeline, WebP unsupported, dimensions guard is not complete decode security screening. PNG and JPEG source<=5MiB/4MP/4096 edges are only initial guards. Reject unsupported inputs honestly. No user SVG or arbitrary URL fetch. Canonical source/emblem/fonts need byte verification; copied prototype assets alone do not prove current hash parity.
- **Persistence/concurrency:** no jobs, lease, duplicate suppression, draft attachment, storage, authorization, retries, audit invalidation or error UI in prototype. Its worker returns one hardcoded public HTTP render without auth; it must not be deployed as-is. Keep rendering endpoint/internal consumer authenticated or internal-only and independent of customer traffic.
- **Photo provenance:** demo source is website `anejo-signature-duo-v2.jpg`, not established documentary event photography. Rendering preserves supplied content, but cannot certify whether it began as generated artwork or a real camera photo. Do not claim authenticity/GBP eligibility from render technique.

## Existing proof versus next acceptance

Existing prototype artifacts report4tests: bounded inputs, aspect/text escaping, nonblank deterministicJPEG, PNGdecode. No new test run performed in this read-only task. Browser renderer tests include `test/money/reposado-layout.test.js` and `social-branding-carousel-ui.test.js`; those do not establish WASM parity.

Next safe bounded task: isolated Pages Functions build harness plus max-size/consecutive-render profiling and one shared-token template golden comparison, all local/private. Produce exact byte/shape/font/resource evidence and honest remaining uncertainty. Only after that add durable job schema and opt-in draft-only consumer. Do not label prototype production-ready or enable unattended publishing.


# Local isolated Pages rendering proof

2026-09-17. All harness files/output are under `/tmp/anejo-render-pages-proof`; no app source, dependency, configuration or deployment changes. Reused installed Wrangler4.129.0 and prototype dependencies. No package installation, remote resource provisioning, image provider calls or deployment. Loopback server stopped after test.

## Observed

- `build.log`: Pages Functions build succeeded with static resvg WASM import and bundled existing image/font bytes. Temporary `/render` handler imports the unchanged prototype core through an absolute local path. No browser DOM, Node compatibility flag, R2 or production credentials.
- `local-pages.log`: local Pages runtime GET `http://127.0.0.1:8807/render` returned200JPEG in333ms logged wall time.
- `pages-render.jpg`: SHA256 `d7da45b1f0cfc5c090c39249d984585c405a9a901f533b1eb2713022e327e67b`, equal to existing standalone Worker prototype benchmark artifact. This proves local Pages wrapper output parity for the one fixed fixture, not parity with the Hub Canvas renderer.
- `stress.json` / `stress.log`: nine sequential Node renders (three each at2000×2000=4million decoded pixels,4096×976,976×4096), valid generated diagnostic JPEG inputs. Same input produced the same JPEG SHA256 on each repeat. Source guards accepted all three near-limit shapes. Render wall time83.95–204.97ms (input JPEG generation excluded).
- Three guards rejected:2001×2000 (>4MP),4097-pixel edge, and compressed size5MiB+1. These are dimensions/header checks, not exhaustive decoder fuzzing.
- Largest observed Node processRSS493,699,072bytes (~471MiB). Includes Node baseline, synthetic input arrays, JPEG source encoding, WASM, output and allocator retention. **This is NOT isolate peak memory or deployed CPU evidence. It cannot establish128MB production safety.** It is enough to retain memory profiling as an unresolved release blocker, not to conclude a specific production limit was exceeded.

## Remaining blockers

No deployed CPU/memory/cold-start/concurrency evidence; no maximum-input local workerd stress (stress above used Node). One loopback Pages render and build do not establish the full existing application's bundle fit. No production plan/budget inspected. No worker job ownership, R2 artifacts, idempotency, rollback/retry or authenticated route added. Temporary handler is local-only and must not be deployed as-is.

Visual limitations unchanged: one fixed template, prototype palette differs from approved Canvas BRAND_INK; no dynamic contrast/food protected regions/glyph-width fit; no EXIF/ICC normalization; typography parity unverified. Diagnostic images are synthetic tests, not edited customer or food assets.

Conclusion: isolated Pages packaging and one local deterministic render are feasible with installed runtime. Production-safe automatic branding remains **Unverified**. Next useful proof is controlled workerd maximum-input/repeated-render memory profiling with an actual isolate-budget measurement method plus shared-token visual parity; application integration should wait for those results.
