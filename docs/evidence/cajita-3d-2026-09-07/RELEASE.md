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

## Live evidence — 2026-09-07, 20:48 UTC

- Release commit 738fa89d5324ed5ef4c65b9888f4f81547cfbd7d was fast-forwarded through the existing authenticated Git connection to main. The GitHub connector could not create a PR (403), browser GitHub was logged out; no repository protections/settings changed. Local full checks and Hub lint/16 tests/build passed before push.
- GitHub CI run 34160397361 completed successfully: https://github.com/dayan-jasonAI/anejo-app/actions/runs/34160397361.
- Pages production deployment 5cf62851-a86f-46d5-81a6-8cbba9dfca78, source 738fa89, branch main. Live homepage, /catering, /cajita, /cajita-builder and builder bundle returned 200. Live AI capability correctly reports unavailable.
- Cron version 4e2af65d-99bc-47cc-8a41-17b52c3639f5 deployed with --keep-vars. A real scheduled execution at 20:48 UTC returned catering-outbox HTTP 200, no exceptions, existing scheduled jobs also HTTP 200. Tail stopped after this evidence.
- Synthetic request release-qa-20260907-738fa89-01 created lead ld_8ce712e5901acbc31d4c. Same-payload retry returned that same lead with replayed=true. One private PNG linked: cat_222cf10727c654b2b906 (4,709 bytes). Test clearly says DO NOT PREPARE, no customer contact/payment/SMS.
- D1 read confirmed 20 standard and 10 dessert-free Cajitas, 30 of each standard savory item, 20 tres leches and 10 skewers; Christmas/star/label artwork placement retained for second variant. Both outbox rows accepted in one attempt, no errors. Hub alert alert_9dd8d715c7b06d01ed0a is open.
- Resend email 1a70c8d8-291b-4711-b8d3-b814c189fad4 reports delivered to dayan@anejocateringco.com. Gmail search found the exact notification with INBOX and UNREAD labels, message 1a07d9f387980131. This proves receipt in the connected inbox, not only provider acceptance.
- Unauthenticated owner, kitchen and private attachment APIs return 401. No private data/file exposed in these checks.
- npm run verify:live passed its public/API checks; its generic --db section was skipped. Targeted D1 checks above were executed separately.
- Mac locked during final live browser checks; authenticated owner/kitchen screen rendering remains Unverified. Local browser interaction checks preceded deployment; live server/API/email checks continued while UI was blocked.
- Follow-up: add direct kitchen/owner navigation to the design summary and publish this evidence. No additional approval needed for the authorized release. Remaining feature work is photorealistic models, enabled AI previews, larger matching packaging and broader print-design parity—not represented as finished.

## Final publication check — 20:51 UTC

Navigation follow-up f34fb8e2365d32e542bdd0e0bfa9a3319f12f0f5 is published as Pages production 35bde217-1bad-434f-ae9c-4740c7221232. Live kitchen navigation includes the design-request link. Repeated full suite: 1,823/1,823 pass; lint and diff checks pass. The live builder JavaScript SHA256 matches the locally tested bundle exactly; HTML matches until Cloudflare's added end-of-body challenge script. All 23 homepage, 13 Cajita and 8 catering statically referenced local images tested returned 200.

The generic strict deploy verifier could not run because its required token environment variables were absent. No credentials were changed to satisfy it. Authenticated Wrangler production listing independently established the deployment ID/main/source above; public reads established actual served content. This evidence-only addendum is retained on the release branch and does not require another application deployment.
