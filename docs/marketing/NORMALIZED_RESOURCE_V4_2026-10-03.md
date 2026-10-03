# Normalized photo resource and storage proof — October 3, 2026

Scope: local authenticated Worker/Durable executor only. No production deployment, binding, database change, public post, customer communication, paid provider call, or credential change. Full marketing goal remains open.

## Failure found and repaired

The first maximum-input run failed on a valid 2000×2000 JPEG (1,033,933 compressed bytes): normalization expanded it beyond the five-MiB PNG limit. The private draft remained unchanged. The initial failure measurements/log are retained under `evidence/normalized-resource-v4-2026-10-03/`; they are not a passing resource result.

The normalizer now chooses standard lossless PNG None/Sub/Up row filters using deterministic residual cost and reused scratch buffers. If the compressed derivative still exceeds five MiB, it retries a bounded list of maximum edges: 2000, 1600, 1280, 1024. Every resize samples the original upright raster, avoids enlargement, and uses premultiplied-alpha interpolation. The original bytes remain preserved. The exact output dimensions and hashes are recorded in the normalization receipt. This is compression plus size-aware resizing, not AI enhancement or proof of premium visual acceptance. A high-entropy four-MP regression independently checks the bounded result, unchanged original and identical repeat bytes.

Behavior version is `resvg-lcms-rgba-2`; renderer version is `local-private-worker-v4`. Readback validates the pinned version, policy and candidate aspect/dimensions. It cannot independently establish that all larger candidates were attempted; that behavior is established by the implementation and tests. Earlier v3/raw hashes are historical and are not treated as v4 equivalence evidence.

A separate stream refusal repair prevents detached cancellation from being dispatched on an invalid derivative size while the owned execution deadline is in force. Its regression checks zero cancellation calls.

## Current observed results

- Full prototype suite: **213 tests; 212 passed, zero failed, one explicit Node-native-base64 skip**. Saved `full-tests.log`.
- Maximum-input authenticated run: **84 requests verified**: 78 attached drafts (13 accepted source fixtures × two Reposado layouts × three rounds), six refused without draft mutation. Sources include square/portrait/landscape/extreme-aspect JPEG/PNG, exact five-MiB compressed input, P3 ICC and rotated P3. Four malformed/oversized inputs and two valid phone-size images are among the refusals.
- Across all 26 accepted source/layout groups, normalized derivative and final image hashes are identical in three rounds. Original library bytes and captured archive hashes remain unchanged. Confirmed normalized D1/R2 receipts, metadata and output provenance are checked; previous schedule/audit fields are cleared on successful attachment. No outbound requests occurred.
- Accepted local client wall times: minimum **985 ms**, median **1,905 ms**, maximum **4,084 ms**. These are elapsed client observations, not deployed CPU or billing measurements.
- Maximum post-response inspector used heap: **57,729,744 bytes**. Maximum backing-storage observation: **108,436,982 bytes**. These separate observations must not be added or labeled peak/total isolate memory. WASM/decoder/compression peak allocation and production budget fit remain **Unverified**.
- A fresh runtime replayed the rotated P3 fixture against the explicitly versioned v4 baseline: **six of six matched**. Its normalization readback is 1600×1600, 4,687,967-byte PNG, original orientation six, conversion recorded. Raw-v2 baseline input is explicitly refused before runtime setup. These comparisons do not establish Canvas visual parity.
- Scoped lint passed with the appropriate Node/Worker globals declared and the existing control-regex validation exemption. No repository-wide lint configuration was changed.

Evidence: `docs/marketing/evidence/normalized-resource-v4-2026-10-03/`. Both runtime measurements retain their bundled input hashes. The final manifest identifies current source hashes; the later harness adds full normalization-receipt capture, so the initial 84-request run and the six-request baseline run have distinct instrumented input hashes. Synthetic fixture generator: `tools/marketing-render-prototype/normalized-resource-fixtures.mjs`. The fixture manifest was generated before the v4 repair; its earlier scope label is historical input metadata, not the version of the tested executor.

## Required next work

The valid 4032×3024 (12.19 MP) and 6000×4000 (24 MP) photos still exceed the current four-MP/4096-edge admission guard. Their safe refusal proves the boundary works, not that phone-photo support is finished. Do not increase the guard without a decode/resize architecture and current memory evidence.

Production CPU and peak combined memory, deployed durable coordination/backpressure, immutable writer policy, normal phone-image support and visual acceptance remain release gates. The new storage bound is not permission to activate unattended production rendering. Next: select and prove a large-photo ingestion/decode path, then verify the actual production execution budget and an opt-in draft-only integration. Continue the full library → design → current audit → owner review → scheduling acceptance and remaining team/Ana/voice/external work in the execution plan. No new owner decision is needed for the next local engineering step.
