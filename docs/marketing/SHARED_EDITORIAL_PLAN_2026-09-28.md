# Shared editorial geometry — September 28

Local implementation; not deployed. Browser Reposado profile definitions now live in a DOM-independent versioned module. Browser composition consumes its five exact profiles and contain/protected-area geometry; the WASM prototype consumes the same contain/projection helpers. This removes duplicate geometry, not the entire visual gap.

The module also exposes a full geometry plan for custom or named profiles with explicit source-normalized protection and canvas-pixel overlays. Plan rejects malformed dimensions/regions and collisions, and always requires visual review. Existing browser font/ink/emblem rendering remains intact. HTML loads the versioned dependency before the renderer; missing dependency explicitly rejects rendering.

Independent root validation: full root suite passed;44focused tests passed;12prototype tests passed; lint0errors/11existingwarnings and Functions build succeeded. Twelve local workerd renders succeeded and matched every pre-extraction JPEG hash exactly. Canvas tests compare recorded drawing operations against archived renderer behavior for all5profiles; they use simulated Canvas metrics and are not pixel/typography acceptance. Raw results/source hashes: evidence-2026-09-28/shared-editorial-plan.json.

No schema, credentials, provider spend, customer sends or production configuration changed. PR160 CI passed at738f73c. New implementation needs its own CI and release; production access/authenticated acceptance remain pending.

Remaining: WASM currently retains its fixed footer. It does not yet consume the full profile drawing plan for text/emblem rendering. Port measured text runs, adaptive ink/tint and sampled-edge extension, then compare real Canvas/WASM images with authentic sources and accented Spanish text. Resource peak/CPU, normalization and durable job ownership remain separate acceptance gates. Do not call this shared visual parity or unattended production readiness.
