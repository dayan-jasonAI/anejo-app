# Añejo conversion and Google presence work

## Scope and authorization

Dayan authorized the website conversion redesign, Google Business Profile updates using existing website images, analytics review for the preceding 60 days, and completion of the blocked marketing work in this thread. Earlier deployment approval remains recorded in the conversation. Owner: Codex. No changes to vault content.

## Observed evidence

- Starting branch: `codex/kitchen-ready-notifications`; working tree initially clean.
- `public/assets/css/home-family.css` applies a green-black gradient of 66-87% opacity across hero photographs.
- Homepage category links and product actions previously used 14px labels; customization links use small text in several sections.
- `functions/api/hub/owner/traffic.js` counts records in `page_views`. It groups by path, source, language, country, and organic referrer. It does not return a cart-to-payment funnel, unique visitors, or purchase attribution. This is first-party traffic data, not a Google Analytics report.
- Browser access to Añejo was denied, then remained denied by a saved preference after Dayan replied "Permission granted". Google Business Profile access was also denied. These restrictions were respected; no alternative access to the denied sites was attempted.

## Local draft changes

- `public/index.html`: single untinted food photograph, literal brand headline, prominent ordering and catering actions, direct Cajita builder link, menu categories moved into a separate section.
- `public/assets/css/home-conversion.css`: responsive homepage styles and larger product/customization controls.
- `public/assets/js/catering-i18n.js`: Spanish translations for new copy.

## Validation and limits

- `git diff --check`: passed after edits.
- Visual rendering, live purchase behavior, Google account state, last-60-day traffic, and paid-order outcomes remain Unverified.
- Draft is not deployed. Do not describe it as a completed redesign before desktop/mobile visual review and purchase-path testing.
- Google profile updates and Search Console actions remain pending site access.
- Do not infer that views are unique potential buyers or that UI friction caused all missing purchases.
- A seven-day sales target requires real paid transaction evidence; no guarantee is asserted.

## Research

- Google business photography: https://support.google.com/business/answer/6123536
- Google photo policy: https://support.google.com/business/answer/7213077
- Checkout research: https://baymard.com/learn/reduce-cart-abandonment
- UI/UX Pro Max: `/Users/aiagent/.claude/skills/ui-ux-pro-max/SKILL.md`; design-system query executed. Existing Añejo identity takes precedence over generic suggested palette/font changes.

## Next work

Restore browser site permissions; inspect Google Business Profile and HUB traffic; validate homepage at desktop/mobile sizes; review cart, delivery costs, scheduling, Square handoff, and confirmed-payment tracking; implement evidence-backed corrections and deploy under existing approval. Preserve entire goal, including Google presence and actual conversion measurement.

## Payment integrity implementation

Local reproduction against baseline `75640c0` showed an unverified confirmation-page visit emitted a purchase event and late consent had no retry. Reproduce with `node scripts/audit-purchase-measurement.mjs` (isolated VM, historical source, no external requests).

Code inspection also found Square `APPROVED` authorizations marked orders paid. Square documents authorization separately from capture: https://developer.squareup.com/docs/payments-api/take-payments/card-payments . This establishes a possible route for unpaid orders to enter the kitchen; it does not establish how often that occurred in production.

Changes:

- `functions/api/webhooks/square.js`: only `COMPLETED` payment events release the order and its associated benefits.
- `functions/_lib/order-receipt.js` and `functions/api/order-receipt.js`: random 256-bit guest receipt capability, 24-hour KV expiry, one order only, no customer data, non-cacheable response. Existing SESSIONS binding; no credentials or migration added.
- `functions/api/checkout.js` and `public/order.html`: return and retain the capability after a persisted checkout. Receipt availability never blocks the Square checkout.
- `public/assets/js/order-confirmation.js` and `public/order/confirmed.html`: bounded payment polling, explicit unverified state, retry, no purchase on direct visits, server-derived discounted merchandise value, transaction deduplication.
- `public/assets/js/consent.js`: event on analytics availability supports consent accepted after confirmation loads.
- `test/money/order-receipt.test.js`, `test/ui/order-confirmation.test.js`, and `test/money/staff-order-notifications.test.js`: regressions for unpaid/canceled authorization, expired or missing capabilities, late consent, deduplication and polling.

Validation on this draft:

- `npm test --silent`: 2,337 passed, 0 failed. Full output: `/tmp/anejo-conversion-tests-20260915.log`.
- `npm run lint --silent`: 0 errors; four existing unused-variable warnings in unrelated files.
- `git diff --check`: passed.
- Prior local SEO validator: 196 locally indexable pages, 140 city catering pages, 510 JSON-LD blocks, no missing canonicals. This is not Google indexing evidence.

Remaining limits: No deployment or real settlement test in this work stretch. Older checkouts have no new receipt capability and show a non-confirmation fallback. KV propagation or delayed webhooks can delay confirmation; retry is available and users are warned against duplicate payment. Historical orders incorrectly advanced by authorization are not retroactively reclassified. GA4 attribution across Square and the preceding 60 days of traffic remain unverified. Browser access was rejected again after Dayan's "Try now"; no bypass attempted.

## Shopping funnel instrumentation

Added `public/assets/js/shop-measurement.js`, wired through `public/order.html` and `public/assets/js/shop-order.js`:

- `add_to_cart` and `remove_from_cart` report quantity differences, not every render.
- `view_cart` records an explicit order-review action.
- `begin_checkout` records a validated submission to the checkout endpoint; repeats count attempts, not unique customers.
- `checkout_redirect` records Square handoff; it is not a purchase.
- `checkout_error` records a failed handoff without sending the error text or form fields.
- Events are consent-gated through the existing GA4 loader. Product IDs, quantities, and displayed item prices are allowlisted; contacts, addresses, and custom notes are not sent. Events before consent are not replayed.

Validation: `node --no-warnings --test test/ui/shop-measurement.test.js test/ui/order-confirmation.test.js` passed all 8 tests. `git diff --check` passed. This new instrumentation cannot reconstruct the prior 60 days. Google Analytics report configuration and real event receipt remain Unverified until account access and a deployed browser test are available.

## Browser permission investigation and full regression rerun

Read-only diagnosis is recorded in `docs/BROWSER_ACCESS_DIAGNOSTIC_2026-09-15.md`, including the exact runtime error classification, conflicting allow settings, matching app/runtime versions, and a support-request draft. The effective denying record remains unidentified. No browser-policy, Cloudflare, DNS, Google-account, or production changes were made. No support request was submitted.

While live work remained blocked, `npm test --silent` was rerun against the branch including shopping instrumentation: 2,341 tests passed, 0 failed, exit 0 (terminal session 24898, duration 7451 ms). `git diff --check` also returned exit 0. These results validate local regressions, not production behavior. Existing deployment approval remains in force; browser recovery and live acceptance evidence remain outstanding.

## Unblocked engineering follow-through

Authorization: Dayan's direct-session request on September 15, 2026, "Do everything you can that's not blocked by the browser issue." Owner: Codex; branch: `codex/kitchen-ready-notifications`. No vault, credentials, browser-policy, production database, Google profile, or deployment changes in this work stretch.

Changes and evidence:

- Payment confirmation now contains analytics exceptions. An unavailable/throwing `gtag` no longer restarts verification after a paid response. Added an executable regression for the failure and subsequent analytics recovery.
- Brief proposal persistence rejects over-60,000-character bodies instead of silently truncating them. Composition retains the full proposal for review; the API returns a length-validation error without saving. Added boundary/no-database-write tests.
- BriefPanel allows editing the proposed body, displays its length, and disables blank, oversized, and demo submissions. Owner-only approval remains unchanged.
- Studio invalidates old requests when switching transcripts. Late responses/chunks cannot append to a newly seeded session or clear another request's state. Duplicate sends before rerender and sends without a saved session are rejected. Four mocked-hook/stream tests exercise these cases; these are not rendered-browser tests.
- Opening Content now closes Brief as well as Recipe. The existing deployed announcement script is preserved in the source HTML so subsequent builds do not drop it.
- Regenerated `public/studio` through the existing build command. Vite intentionally leaves the non-module shared announcement script external; it remains present in the generated HTML.
- SEO validator output now says `indexablePages`, correcting the unsupported implication of Google indexing.
- Fixed the daily-cap test clock. The fixture's fixed September 15 10 AM timestamp became stale relative to the real clock; the test now freezes Date at its intended instant. No production sending logic changed.

Final validation:

- `npm test --silent`: 2,344 passed, zero failed; exit 0; output `/tmp/anejo-unblocked-tests-20260915.log`, terminal session 16367, 6531 ms. Earlier runs exposed the clock-dependent test and a tracked generated asset being replaced during build; final run occurred after build and staging.
- `npm --prefix hub-app test`: 20 passed across three files; exit 0.
- `npm run build:studio`: TypeScript and Vite build passed; generated JS `index-BOyPizLN.js`, 369.69 kB / 114.71 kB gzip.
- `npm --prefix hub-app run lint`: exit 0.
- Root lint: zero errors, four pre-existing unused-variable warnings; no new warnings from the edited backend/tests.
- `node scripts/verify-local-seo.mjs`: 196 locally indexable pages, 140 city pages, 196 sitemap entries, 510 parseable JSON-LD blocks, zero missing canonicals. Does not validate Google indexing, ranking, content usefulness, or rich-result eligibility.
- `git diff --cached --check`: exit 0.

Remaining engineering risks (not browser blockers): `decideProposal` still uses separate writes for snapshot, document replacement, and approval status; failure/race handling needs transactional tests and an atomic implementation. `RecipePanel.publish` creates a recipe again on each retry if creation succeeds but publication fails; preserve the created recipe ID before retrying publication. These are open findings, not resolved by this batch. No claim that all browser-independent work is exhausted.

Browser-blocked acceptance: real AI provider generation, rendered Brief editing and session switching, all live roles, notification delivery, completed Square checkout, Google profile edits, and account analytics. No production readiness or SEO outcome is asserted. Deployment approval persists; release remains pending acceptance evidence. Rollback for this batch is a scoped revert of its commit before deployment; no data migration is involved.

### Second batch: recipe retries and atomic approval

Continued working on both engineering findings above in the same session:

- RecipePanel retains the created recipe ID after a failed publication and retries that ID. The saved name is locked for that retry; requesting a new draft clears the saved ID. Drafting/publication controls cannot intentionally overlap. Three API-flow tests cover failed publication followed by retry, failed creation, and network loss. A lost response from the initial create remains ambiguous; server-side create idempotency is not introduced here.
- `decideProposal` now claims a pending proposal and performs snapshot, document replacement/creation, and approval together in a D1 batch. A unique per-call claim prevents a competing decision from applying the same proposal. Rejection/needs-info updates also require the proposal still be pending.
- Four tests run against real in-memory SQLite with all migrations: normal approval/duplicate replay, injected final-write failure with full rollback, competing rejection before batch execution, and owner-only creation of a missing brief.
- D1 batch transaction behavior checked against official documentation: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch . Production D1 execution remains Unverified.
- This makes one approval atomic; it does not merge distinct proposals based on older full-document drafts. Owner review of overlapping proposals remains necessary.

Final second-batch validation: root suite 2,348 passed, 0 failed (session 2921; 6934 ms; `/tmp/anejo-unblocked-tests-20260915.log`); Studio 23 tests passed; Studio lint exit 0; root lint exit 0 with the same four existing warnings; Studio TypeScript/Vite build passed, generated JS `index-DYOndVsd.js` (369.87 kB / 114.79 kB gzip); staged whitespace check exit 0. No deployment.

Coordination note: command-center risk R-038 warns that governance writes automatically propagate externally. This session therefore records its handoff, approvals, daily work, validation, and residual risks in this repository log rather than editing shared command-center boards during local-only work. Existing direct-session approvals are retained, not re-requested. No additional Dayan approval is needed for the code in these two batches; browser-dependent acceptance and existing release controls remain outstanding.
