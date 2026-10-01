# Audit library provenance — September 28, 2026

Status: local candidate, not deployed. Full marketing goal remains Open — evidence missing.

## Observed gap and change

The audit loader discarded R2 custom metadata, so a saved AI-enhanced or converted photo reached the model without its recorded history. This is relevant review context and can inform applicable owner instructions; it is not a reason to automatically fail the seven criteria, whose authenticity exclusions remain unchanged.

The loader now normalizes four bounded fields into a stored-metadata declaration: AI true/false/unknown, a safe immediate source key, known transformation method, and known conversion basis. Missing metadata stays unknown. Invalid field names are recorded without their raw values. Arbitrary provider/model/name/prompt metadata is excluded.

The actual provider request includes this declaration as data, with explicit limits: no authenticity or pixel-derivation proof, no automatic failure for approved enhancement, and no publication permission. Saved input coverage retains it. Owner audit details show declared AI status and source, escaping text and explicitly disclaiming authenticity proof.

Image receipt verification and the post-model re-read compare normalized history as well as image bytes. A same-byte metadata change rejects stale evidence; legacy receipts without the field only remain compatible when current provenance is absent. This does not make R2 and D1 writes atomic or add a continuous live metadata monitor. Historical UI details remain saved snapshots.

## Validation record

Root `npm test`: 3,357 passed, zero failures. `npm run lint`: zero errors, 11 existing warnings. `npx wrangler pages functions build --outdir /tmp/anejo-audit-provenance-functions`: compiled successfully.

See evidence-2026-09-28/audit-library-provenance-validation.json for source hashes and root command results. Tests cover tri-state status, invalid metadata, exclusion of arbitrary metadata, same-byte mutation, legacy compatibility, actual saved-audit rejection, model-request propagation, unknown-result preservation, and owner display. Tests use local D1/R2/provider doubles, not live provider semantic acceptance.

Reviewer: root independently reviewed delegated loader/tests. Root owns provider prompt and owner display. Existing direct-session implementation/release authorization applies after checks; no public post, customer send, credential change, charge, or production mutation occurred.

Release remains dependent on the existing stack and Cloudflare access gate; authenticated Hub acceptance remains pending. Next: release once prerequisites are restored, then compare saved provenance through photo selection, audit, and scheduling. No new approval requested for this authorized repair.
