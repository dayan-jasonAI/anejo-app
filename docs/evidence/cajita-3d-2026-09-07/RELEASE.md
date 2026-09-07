# Cajita initial public release — 2026-09-07

Owner: Codex. Approval: Dayan, direct session on 2026-09-07: supplied Amazon ASIN B0D1CB87P2 and instructed “go ahead and publish everything.” Scope: website feature release, additive request storage and scheduled notification recovery. No purchases, DNS, secrets or payment changes.

This addendum supersedes the earlier HANDOFF.md deployment hold for the **initial illustrative configurator only**. It does not establish completion of realistic food models or public AI theme generation.

## Prepared changes

- Food-first homepage with Cajita images, reduced-motion-aware slideshow/pause, builder and quote entry points.
- Multi-version configurator: six standard foods including tres leches, optional skewer, additions/removals, colors, holiday presets, personal text and uploaded JPG/PNG placement. Original emblem/wordmark preserved. PDFs are reference attachments only.
- Actual original box verified from supplied Amazon listing: Leafiew white paper base/clear lid, 7 × 5-inch footprint. Height and larger matching options remain unverified. No fit guarantee.
- Atomic lead, private attachment claims, structured event record and notification outbox. Stable request ID and frozen retry payload on both forms. Hub/email retry leases and provider idempotency. No automatic mail-app fallback.
- Owner receives complete configuration and selected-request attachment metadata; kitchen receives counts, omissions and variants without customer contact information. Quote requests are labeled as not approved production orders.

## Validation before publication

- npm run build:cajita — exit 0.
- npm run lint — exit 0.
- npm test --silent — 1,823 passed, 0 failed. Run log: /tmp/anejo-cajita-release-tests.log.
- npx wrangler pages functions build --outfile=/tmp/anejo-cajita-release-worker.js — compiled.
- git diff --check — exit 0.
- Browser local desktop/mobile: homepage food-first CTA; 20 standard plus 10 without dessert yields 30 boxes, 20 desserts; one skewer in second version yields 10 skewers. Christmas palette, star pick, label/tag text and lid toggle exercised. 390px preview inspected after final fixed-footprint/food-height adjustment.
- Backend tests cover claim races, duplicate requests, changed-payload conflicts, rollback, late uploads, leased retries, provider ambiguity and authoritative event/config parsing. Frontend tests execute actual submission handlers through ambiguity, rate limiting and retry.

## Database preparation

Applied only migrations/0098_catering_request_outbox.sql to production D1 anejo; five queries successful. Additive tables/triggers; no existing customer records edited.

Pre-change time-travel bookmark: 000005e3-00000026-000050df-626d1fc9bbe6c4982c260f5430103d26.
Post-change bookmark: 000005e3-0000002c-000050df-c28b8680b78678c77d57f6aca42470cd.

## Remaining boundaries

- Food meshes are illustrative and do not yet meet the requested photorealistic quality. Three prior external conversions failed without returning models.
- AI-generated theme previews remain disabled pending provider/budget/output verification. Manual palettes, themes and artwork work independently.
- 20 variants, 50 copies of an item per box, five files up to 10MB each; first 28 food meshes displayed, full quantities stored. Larger/custom requests require management review.
- Pending retry identity is retained in page memory, not across forced reload/crash. Before-unload warning advises retaining the page. Saved server records remain durable.
- Email provider acceptance is not proof of inbox delivery. Live request/alert/receipt evidence must be appended after deployment.

## Publication and rollback

Production publication is pending at this record's creation. Use reviewed branch → main Pages auto-deploy, then deploy the cron Worker preserving existing variables. Verify production assets and a clearly marked non-customer test request. Roll back website/cron code if needed; retain additive tables and all new requests. Never restore the entire database over subsequent customer data merely to undo a code release.
