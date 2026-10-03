# PNG orientation in the editorial prototype — October 3, 2026

Scope: authorized private engineering toward unattended branded photo rendering. Branch `codex/png-editorial-orientation`. No application route imports this isolated prototype. No production account, image, database, trust gate or publication changed.

The bounded PNG chunk reader now reads bare TIFF eXIf orientation in either byte order, before or after image data. It rejects duplicate eXIf, invalid eXIf CRC, malformed TIFF, invalid orientation, truncated chunks and oversized inputs. It strips eXIf only from an ephemeral decoder copy to prevent a decoder from applying orientation twice. Original bytes remain unchanged; color metadata is retained, not normalized. This reader is not a complete PNG validator: actual image decoding remains the raster runtime's responsibility.

Source: https://www.w3.org/TR/png-3/#eXIf . W3C describes eXIf as potentially historical after editing; orientation is therefore a declared metadata transform, not proof of image correctness. Existing visual-review requirement remains mandatory. The caller must use protected regions measured in the upright display coordinate system.

Validation: `npm test --prefix tools/marketing-render-prototype` passed 31/31. Actual WASM raster tests verify all eight PNG orientations using four distinct corner colors, no double transform, correct portrait geometry, and unchanged originals. Existing JPEG orientation, food-protection, fonts, branded ink, text-fit and original-pixel tests also pass. `node tools/marketing-render-prototype/resource-profile.cjs --editorial-profiles` produced 10 deterministic HTTP 200 renders through local workerd for the existing JPEG fixture; this is regression evidence, not PNG workerd or production memory acceptance. `git diff --check` passed. Logs and source hashes are in `evidence-2026-10-03`.

Remaining: ICC/color normalization, browser/WASM typography and halo parity, deployed CPU/peak-memory/concurrency proof, durable job integration, and owner review of real generated output. No new approval is needed to continue this authorized internal work. External Google API approval and designated staff sessions remain separate prerequisites. The full marketing goal stays active.

Rollback: revert this prototype-only change; no data migration is involved.
