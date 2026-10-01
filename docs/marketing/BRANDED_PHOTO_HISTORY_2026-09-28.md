# Branded photo history — September 28, 2026

Status: local candidate; not deployed or authenticated live acceptance.

## Source finding

The branded-save route wrote JPEG bytes without source metadata. Thus adding the authentic emblem and editorial text to a library photo discarded its recorded AI status. The following audit could only report unknown even when the parent was explicitly AI-enhanced.

## Intended repair and limits

The server reads the immediate parent bytes and bounded history. It includes that history in the existing durable request fingerprint and saves the immediate source key, editorial-overlay method, client-declared basis, and optional validated AI flag on the new object. Missing AI history remains absent. It does not copy arbitrary provider/model/name fields or claim that client-rendered bytes were independently reproduced by the server.

Readback verifies output bytes and metadata, and the source is rechecked before attachment. Changed source history conflicts with reuse of the same request identity, including after an uncertain storage failure. Existing pre-feature receipts use the older fingerprint and intentionally conflict rather than being rewritten. They must be inspected and a fresh preview created if appropriate; this change does not retroactively repair them. R2/D1 rechecks remain decision-time checks, not an atomic cross-store transaction or a complete ancestry attestation.

The audit loader accepts the editorial method and forwards the declared context with existing authenticity limits. No score, trust setting or publication authority is automatically granted.

## Verification

Root `npm test`: 3,365 passed, zero failures. `npm run lint`: zero errors, 11 existing warnings. `npx wrangler pages functions build --outdir /tmp/anejo-branded-history-functions`: compiled successfully.

Root independently reviewed route/tests and recorded exact root commands and hashes in evidence-2026-09-28/branded-photo-history-validation.json. Tests exercise actual branded save → audit loader, metadata changes, retry/concurrency and output readback. Local doubles do not prove live R2 semantics or provider audit accuracy.

Approval: direct-session implementation/release authorization after checks. No public post, customer communication, credential change, charge, or production write. Existing release/access dependencies remain. Next: release together with the stack after prerequisites, then authenticated photo → branding → saved audit acceptance.
