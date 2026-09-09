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
