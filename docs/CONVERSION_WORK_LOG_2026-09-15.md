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
- Prior homepage SEO validator: 196 indexed pages, 140 city catering pages, 510 JSON-LD blocks, no missing canonicals.

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
