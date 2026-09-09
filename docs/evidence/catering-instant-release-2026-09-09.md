# Catering instant-price release

Owner: Codex; authorization: Dayan direct session, 2026-09-08 ET, “finish it”, following approved48h standard/72h custom-printing and automatic checkout at displayed prices.

## Implemented
- Read-only live D1 food estimates, exact tray/single combinations, per-product unpriced disclosure, bilingual EN/ES panel and exact eligible cart transfer into existing Square checkout.
- Server-side48h minimum from Eastern delivery-window start for catering/traditional SKUs; shared timezone/DST helper, client date/window filtering, bilingual notice.72h custom-print requirement communicated; bespoke printing remains quote-only, not an unpriced free addon.
- Existing grouped catalog/photo and custom balance-payment work from origin/main29aab96 preserved through reviewed merge. Raised catering quantity technical limit to5000 consistently; no daily capacity cap invented.
- Stabilized existing outbox race test to replay whichever request actually wins, rather than assume request0 wins. Production outbox behavior unchanged.

## Validation
- npm test --silent:1927 passed,0 failed; /tmp/anejo-catering-final-tests.log.
- npm run lint:0 errors,2 existing vendor warnings.
- Wrangler Functions compilation and main deployment guard checked before publish.
- Browser local ordering page renders merged grouped catalog without script failure; static-only server intentionally has no menu API.

## Remaining boundaries
No price changes, purchases, secrets/config/database changes or live payments made. Pricing is inherited from existing live catalog, not claimed margin-optimal. Standard Cajita/Hawaiian-roll and3–4oz dessert equivalences have no approved direct-sale SKUs; those combinations remain quote-only. Custom prints, uploads, food changes and allergy notes block automatic transfer so instructions cannot be lost. Fit customization stays in existing bowl editor. Stock checks are not atomic future-event inventory reservations. No new claim of verified payment-to-email inbox delivery. Realistic3D remains separate unfinished scope.

## Deployment / rollback
Deployment receipt and live browser/API verification appended after release. Revert only this release's changes via reviewed commit; do not roll back unrelated grouped catalog/payment updates.

## Production verification receipt
- Pushed main2184329 and branch codex/kitchen-ready-notifications. Production deploymentff78e51a-6863-439c-8873-2ebbc2461864 includes final owner-calendar consistency fix. Earlier release916ed52e-c520-4a05-be8a-5062e1ac367d verified full selection-to-cart browser path.
- Main domain /api/catering-estimate returned200,4000cents for25ham croquetas, mapped to one catering_croq-jamon-25 tray. No order created.
- Main domain /api/checkout rejected insufficient48h notice with bilingual400 before collecting address/payment. Owner-enabled Sunday2026-09-13 passed calendar validation and stopped at missing street address400; no payment link/order created by that probe.
- Browser confirmed English selection25pieces -> one25piece tray -> $40food subtotal, $5existing delivery estimate, $2.80existing tax estimate. No payment submitted; taxes/pricing configuration unchanged.
- Main domain Spanish pricing panel showed $40 and “Continuar al pago seguro”. Adding custom instructions removed that button and retained subtotal/review guidance. New UI EN/ES verified; not a claim every pre-existing catalog description is translated.
- Returning-browser stale cache fixed via versioned script URL. Main-domain bundle matched local SHA256 c14d1daa4a31705ea9cf676551502b3956cef41ad9424d4f0d30939ddf67c55e.
- Final regression run1927pass/0fail. Changes created pricing/notice helpers, API, tests and release record; modified form bundle, checkout, grouped-shop quantity controls and build entry. No new paid service.
- Remaining Dayan decision/input: approved standard Cajita sale price and deterministic personalization/add-on price schedule (or measured food/labor cost inputs to derive them). Full bespoke auto-confirmation remains information-blocked; pricing engine never calls missing components free. Kitchen/email paid-order delivery not freshly end-to-end verified. While deployment built, continued browser validation and fixed cache/calendar mismatches.
