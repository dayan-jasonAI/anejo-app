# Homepage refinement and Square path audit — 2026-09-09

## Authorized changes
User requested faithful congrí, salmon Fit cover, newest-addition Cajita positioning and top navigation, a photographic background, and checkout coverage.

Replaced lechón plate asset after two image edits against the user's actual Congri - Tray reference. Second edit selected for finer long grains, deeper purple-brown color and cracklings. Replacement filename updates homepage/menu/order use. MAR salmon now covers Fit. Cajita has a direct top-bar link and newest-addition callout. Background cycles through existing Añejo event/food photos; pause and reduced-motion handling included. No invented customer scenes or video.

Every homepage bowl now links directly to its customizer; drinks and sauces link to their ordering categories. One-time checkout requests explicitly permit Apple Pay, Google Pay and Cash App Pay, while cards remain Square-hosted. No merchant credentials or account settings changed; Afterpay is not forced because eligibility is unverified.

## Payment path evidence and limits
- Live /api/menu: D1, 128 SKUs (7 bowls, 3 drinks, 118 add-ons).
- New regression test invokes the actual checkout handler for every SKU with a mocked Square adapter and mock D1. Verifies server price defeats tampered client price, payment URL returned, order persisted, wallet flags sent. No live order or charge created.
- Browser exercises all 121 non-bowl variants through family customizers into cart, across 56 families and 7 categories.
- Live /api/square-config reports production and configured application/location IDs (identifiers not copied into this report).
- Ordinary food/trays: menu → family/bowl customization → cart → /api/checkout → Square payment link → confirmation → existing webhook.
- Weekly plans: /subscribe → Square Web Payments card/Apple Pay/Google Pay → subscription API. Cash App/Afterpay are not recurring-payment options.
- Custom Cajita/events: request → owner-reviewed quote → Square deposit link. These deliberately do not charge a guessed price from the builder.
- Gap closed during this task: owner can create a final-balance Square link for a paid-deposit quote. Stable idempotency key and saved link avoid duplicate creation. Transactional webhook reconciliation requires matching amount and USD currency; storage errors return 503 for retry. Manual marking is blocked once a Square balance checkout is reserved. No messages are sent automatically.
- Actual wallet rendering depends on eligible device/account. No completed live card/wallet transaction was tested. This audit does not prove settlement.

Sources: https://developer.squareup.com/reference/square/objects/AcceptedPaymentMethods and https://developer.squareup.com/docs/checkout-api/guidelines-and-limitations (checked 2026-09-09).

## Validation
Full tests: 1,907 passed; lint zero errors, two pre-existing vendor warnings. Browser evidence and screenshots included. No public/customer messages sent. A controlled live payment verification remains unperformed; mocked-provider and real-SQL integration checks are not proof of actual settlement.

## Balance release
Additive migration 0099 creates a dedicated balance-checkout table, without changing existing customer quotes. Real SQLite test verifies exact balance, saved-link reuse, atomic paid status and duplicate-event no-op. Four balance tests added; owner authorization remains required. No payment links were generated for real customers and no charges were attempted.
