# Complete authenticated Worker maximum-input proof — October 3, 2026

Status: local implementation/run evidence, not production resource acceptance. Full marketing goal stays open. No application route, live database/configuration, credential, provider call, purchase, trust setting, public post or customer communication changed.

## Current results

Root independently ran the new private-resource-stress.cjs against the freshly generated synthetic resource-fixtures manifest. The exact private-draft-worker handler ran without test wrappers in one local workerd isolate with actual D1/R2/KV bindings and synthetic owner authentication. 70 requests verified:66 draft attachments and4 invalid-source refusals. All 66 output hashes matched the existing raw-renderer source/profile baseline. Maximum-pixel aspect ratios in JPEG/PNG, including exactly 5 MiB PNG, exercised both current Reposado designs three times sequentially. Originals, captured copies, receipt/output hashes, provenance, draft/slide selection, revision advancement and audit/schedule clearing were checked per accepted request. Refused inputs retained originals and prior draft/audit state without a rendered job or attachment. The over-pixel fixture was copied/confirmed before compositor refusal; confirmation denotes storage verification, not valid rendering or approval.

Root run exited 0; completed 2026-10-03T12:28:18.586Z. Highest observed client wall time 550.2995 ms; largest post-response inspector usedSize 56,195,892 bytes. These are instrumented local observations, not deployed CPU, peak memory, total isolate usage or headroom. WASM memory was unavailable from the unchanged handler and explicitly remains unsupported/uninferred. No inspector fields were added together. Outbound request list empty. Script syntax and git diff --check passed. Historical 144-test / 143-pass prototype results are separate and not relabelled as this run's evidence.

Evidence: evidence/authenticated-worker-resource-2026-10-03/measurements.json, root-run.log, fixture-manifest.json. Measurements contain module/font/emblem/WASM/bundle hashes and Node/workerd/Miniflare/esbuild/resvg versions. The generator and harness are tracked; temporary full synthetic fixture images may expire and can be regenerated. Agent independently completed a separate 70-request run before root's run; root's durable evidence is authoritative for this checkpoint. Harness operation/inspector/disposal deadlines protect the local experiment; they are not application-wide runtime cancellation guarantees. An initial agent run exposed a harness module-path resolution error; that script-only defect was fixed before both completed runs. No handler or design simplification was used to pass.

Reproduce from repository root:
node tools/marketing-render-prototype/resource-fixtures.mjs
node tools/marketing-render-prototype/private-resource-stress.cjs <generated-directory>

## Hosting access and dependencies

Root used normal supported Chrome to inspect the existing account's Workers plans page. It redirected to sign-in and displayed that continuing accepts Cloudflare terms. No Continue/sign-in/terms action occurred. Current plan/CPU settings remain unverified; CLI authentication and local success are not plan evidence. Root kept the page for owner handoff and requested personal sign-in, with no purchase or settings change. Readback: hosting-readback.json. This browser dependency does not block independent engineering.

## Non-rendering next work identified

Current read-only code review identified three gaps; these are not live-status conclusions. Analyst retrospective query coverage remains unknown in team_lead.js despite supplied aggregates; add bounded source/query/read-status and exact rendered-text receipts while preserving unknown revenue/quote attribution. Ana's inbound→draft→review/send-receipt acceptance is split across tests; add one synthetic continuous real-handler rehearsal with unknown outbound requests denied and no customer sends. operator.js fixes recognition/TTS to en-US; align EN/ES speech with existing language state, then separately verify actual device microphone/audio permissions and behavior. Existing joined strategy/content and Lead–Intel fixtures already exist and must not be rebuilt.

Root continued maximum-input evidence while hosting sign-in remained pending; the analyst receipt repair is assigned as the next bounded engineering work. Broader gates still include actual deployed CPU/invocation/peak-memory evidence, cross-isolate concurrency/backpressure, overall runtime deadlines, bucket-wide writer policy, source ICC normalization, Canvas/owner visual acceptance, live audit semantic/provider acceptance and all named team/Ana/voice/channel workflows. No full completion or paid-order uplift claim.

## Subsequent hosting readback, 12:51 UTC

The retained normal Chrome tab now exposes the signed-in account. Workers plans shows Paid with the disabled Current plan button. Añejo production settings shows CPU time limit : —; the opened pricing control has an empty value/min/max/placeholder. Root cancelled without saving. Compatibility date is 2026-05-01 and placement Default. Current production section still shows a668dbf/3805c17f. No login, terms, purchase, credential or settings action was performed by root in this inspection. This supersedes the sign-in blocker, not the outstanding renderer resource gate. Evidence: hosting-readback-current.json.

Current [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) says Pages uses the Workers Standard model. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) documents a paid HTTP CPU default of 30 seconds and 128 MB per isolate including JS and WASM. The account plan plus blank override supports using those documented defaults as the expected budget, explicitly an inference; the precise deployed render CPU/peak memory still requires measurement. No limit was increased or claim of production headroom made.
