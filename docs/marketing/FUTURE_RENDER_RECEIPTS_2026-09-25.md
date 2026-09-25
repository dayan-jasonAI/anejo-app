# Future Reposado receipts — exact storage and trust boundary

Read-only inspection, 2026-09-25. Repository: `/Users/aiagent/Dayan Workspace/Aether/anejo-app`. No edits, provider calls or deployment.

## Current flow, verified in code

1. `public/hub/owner/marketing.html:1040-1073` reads selected source media key, text, kicker, accent/footer, preset/layout/mark/finish and calls `AnejoBranding.compose('/api/hub/media/'+key, opts)`. `onLayout` stores a local variable. `marketing-branding.js` loads the source and emblem with browser Image, obtains fonts, renders Canvas and returns JPEG dataURL. Editorial callback reports text region/emblem rectangle/ink; it omits literal drawn lines, final measured font state and source/output hashes. Other renderer branches have different report completeness.
2. On **Use this**, `marketing.html:1081-1096` POSTs only `{data_url,role}` to owner/social-upload, then `replace_media` with post/media IDs and expected old key. The layout report is discarded. The role suffix comes from the filename; it is not photography or render provenance.
3. `functions/api/hub/owner/social-upload.js` checks MARKETING_DESK, decodes uploaded bytes, checks JPEG prefix, writes a fresh `studio/.../up_*.jpg` R2 key and returns key/size. It does not hash source/output, validate render options, persist a receipt or bind the upload to the selected source. Its decoded8MiB cap/message5MB and unbounded request.json allocation are existing inconsistencies; a new receipt endpoint should use explicit streamed bounds rather than copy them.
4. `functions/api/hub/owner/social.js` replace-media path guards allowed draft states and old key, updates the exact slide, resets audit/schedule/approval; it has no render-receipt linkage. Upload and attachment are separate, so failed replacement may leave an unattached private artifact.
5. Photographic polish is a separate browser pipeline: `marketing-photo-polish.js:create` uploads JPEG through marketing-library with `{polish:{source_key,preset}}`; library route confirms original source existence and lineage restrictions, but not pixel-transform truth. AI enhancement route reads source bytes, calls provider, reads result and writes separate R2 derivative with source key/provider/model/AI marker. `marketing-photo-enhance.js:generate/use` previews that already-saved derivative, then invokes caller onUse. **There is no server enhancement-finalize attestation.** Neither branch provides exact baked overlay/logo facts, and an AI-retouched result cannot inherit the original's layout facts.

## Smallest complete durable receipt path

Create one bounded authenticated branded-save route and immutable receipt table. Keep existing generic social-upload behavior untouched for ordinary images. The branded-save request supplies expected post/media/source key, expected original source hash, output JPEG bytes, bounded template options and a browser layout declaration. Server reads allowed source bytes from R2, hashes them, validates expected source/media relationship and current private draft state, validates output format/decoded size, computes its own output hash, chooses fresh output key and stores a receipt. No remote URL accepted; allow only intended studio/marketing-library namespaces and an actual authorized post/source relation. Declared URLs, hashes, actor identity and trust level are not authoritative client fields.

For actual browser source consistency, render from the same fetched private source Blob that the browser hashes, not a second independent key fetch. Pass exact source bytes to the renderer through an object URL and revoke it afterward. Server matching the reported hash to R2 proves source identity at save time, not that a malicious browser really rendered those bytes.

Receipt fields: receipt ID; source key/SHA256/bytes; output key/SHA256/bytes/dimensions; source media ID and expected key; renderer asset hash/version; template ID/version; exact bounded render options; literal drawn text runs and measured rectangles/rotation/inks; emblem source/hash/rectangle/variant; font asset hashes and observed load/fallback state; author from authentication; timestamps; evidence tier; visual-review state. Mark fields individually as **server-observed bytes**, **client-declared render output**, or **trusted server-rendered output**. No source-photo authenticity or public-post approval field should be inferred.

Capture actual draw-time words from the shared renderer, including wrapped final title lines and uppercase kicker; do not reuse arbitrary unused form fields, manifest text or planned overlays. Every renderer branch must either emit a supported bounded report or explicitly state metadata unavailable. Record font fallback rather than claiming the requested face loaded. Geometry is a renderer declaration, not proof that a plate or text stayed visible.

After R2 put and D1 receipt insert, attach with atomic expected-source/post status predicate. Either combine receipt insertion and media replacement inside one D1 batch, or create unlinked upload receipt followed by explicit atomic linking. In either case, public content is not changed. Failed attachment returns explicit unattached private artifact; keep recoverable state and idempotency key instead of making duplicate output on retry. No automatic deletion or overwriting of originals. Historical receipt should survive slide/draft deletion via immutable historical identifiers, as marketing_asset_uses already does.

`replace_media` may accept a receipt ID only if the server confirms exact output key/hash, actor/source relationship and unchanged selected source. Users cannot attach arbitrary receipt assertions to other assets. Detach/reorder preserves receipt origin and uses current slide order; order must not be baked into reusable asset facts. Reuse registry approval remains a separate explicit draft-use decision.

## What the server can and cannot attest

A server-computed source/output hash attests byte identity and association. Schema validation, an authenticated owner and a renderer-version string do **not** prove Canvas applied the declared text or logo. Do not label browser declarations “verified rendered facts” or feed them to the auditor as fact-level evidence. An owner may explicitly review the rendered output and declaration; record that separate reviewed-declaration tier with actor/time/hash.

To make fully automatic trustworthy baked-text/geometry receipts, a trusted server renderer must produce both JPEG and receipt from controlled inputs, or reproduce and validate the deterministic result. The local resvg prototype lacks proven resource safety and Canvas visual parity, so that stronger path remains unavailable today. The smallest honest immediate implementation is durable **browser-declared + server-byte-verified** receipts, optionally upgraded by explicit human review, with exact tier shown to auditor. The existing26 registry remains reviewed export declarations, not a magic precedent for trusting any new client data.

Audit integration: hash the actual R2 bytes; receipt lookup only by exact output SHA256; provide live numbered slide ID plus receipt facts/tier; never use stale key-only metadata. Unreviewed browser declarations remain untrusted assistance and must not suppress an unknown/violation or earn automatic trust. AI enhancement or photographic polish after branding creates a new hash and needs a new receipt; don't propagate overlay geometry automatically through a changed image.

## Meaningful verification

- Actual renderer fixture captures literal drawn lines/regions/rotation; unused fields omitted; every preset covered; font fallback explicit.
- Forged actor/trust/hash/URL/extra fields rejected; JPEG size/dimension/decode failures bounded before large allocation.
- Source changed during preview, stale media ID/key, changed post status, or output/receipt mismatch refuses linking without altering another post.
- Output hash is server-computed; client-declared facts cannot obtain reviewed/server-rendered tier without the separate authorized transition.
- Idempotent retry returns one output/receipt; D1 failure after R2 write reports orphan honestly; attachment failure leaves no claimed success.
- Published/scheduled protection retained; saved edits clear previous audit/schedule/trust credit; receipt insert never publishes or changes trust counters.
- Reordered slides use current ordinal and exact corresponding hash; changed bytes lose receipt match; AI/polish derivatives never inherit prior overlay truth.
- Genuine test fixture covers deliberate mismatch between output pixels and submitted overlay declaration: server stores only untrusted declaration and auditor does not treat it as verified facts.

Suggested implementation ownership: branding.js for draw-time report; a new branded-save route/helper + migration for receipt contract; marketing.html Use action for one save/attach result; social.js for atomic linkage; photo-polish/enhance only for later shared derivative-lineage contract. Root owns audit integration. Keep production renderer/resource work separate from receipt bookkeeping.
