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
