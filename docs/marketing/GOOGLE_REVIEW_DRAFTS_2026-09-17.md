# Google review private draft workspace — 2026-09-17

## Implemented local behavior

`/hub/owner/google-reviews.html` provides a separate Marketing workspace with a clear disconnected status. Authorized owner/admin/marketing roles (the existing MARKETING_DESK policy) can manually enter review text, optional rating and Google source link, and a proposed reply. The source is always `manual_unverified`; links are stored, never fetched. A generic starter requires confirmation before replacing typed text. Save, edit, dismiss and refresh act only on private local application records. There is no Google send, sync, connection, approval or publication control.

`GET /api/hub/owner/google-reviews` returns the latest 100 local drafts plus explicit unavailable provider capabilities. `POST` accepts only create/edit/dismiss. Create has idempotent request IDs; edits and dismissals use optimistic version checks. Unknown fields/actions, invalid rating, unsupported link hosts, controls and oversized text are rejected. Missing storage returns 503, not an empty inbox. UI errors preserve form text; failed refresh clears the obsolete list.

## Files

- `migrations/0116_google_review_drafts.sql` — additive private draft table; no migration applied to production by this task.
- `functions/_lib/google_review_drafts.js` — disconnected capability contract and deterministic validation.
- `functions/api/hub/owner/google-reviews.js` — authenticated private CRUD endpoint.
- `public/hub/owner/google-reviews.html` and `public/hub/owner/assets/google-review-drafts.js` — standalone UI.
- `test/money/google-review-drafts.test.js` and `test/ui/google-review-drafts.test.js` — behavioral storage, authorization, validation, conflict and UI-error tests.

## Evidence and limits

Local command `node --no-warnings --test test/money/google-review-drafts.test.js test/ui/google-review-drafts.test.js`: 7 passing, 0 failing (2026-09-17). Scoped ESLint, frontend `node --check`, and `git diff --check` passed. Tests use synthetic generic feedback, no customer-specific source data. Migration runs only inside isolated test SQLite. Browser rendering, deployed endpoint behavior and production migration remain Unverified.

Parent owns Marketing discovery link, integration release checks and deployment. No credentials, external Google requests, customer communications, production writes or deployment occurred in this task. Before a future connected workflow can exist: separately authorize and implement a verified Google Business connection, correct business/review mapping, provider response evidence, exact final reply preview and explicit sending authorization. This draft workspace does not imply any of those prerequisites are satisfied.

Rollback: remove page discovery/access to the feature through a reviewed code revert; retain the additive draft table and saved content. Do not delete stored records as a rollback step.
