# Daily lunch order-category release — 2026-10-01

Owner: Codex. Direct-session authorization: Dayan requested Daily Lunch as the first category on the existing Order page, $10 awareness, one lunch per day, Thursday Papa Añejo, and an attractive homepage popup. Earlier in-session authorization covers deployment after checks. Clinic behavior is excluded.

## Implementation
- First/default $10 Daily Lunch category, integrated with existing contact/address/consent/Square checkout.
- One meal card for the selected configured date. Dated links fetch the requested date range. No next-week assignments invented.
- Thursday October 1 reads Papa Añejo from the existing authoritative daily-lunch API. Price, availability, fees and order cutoffs remain server-authoritative.
- Editorial dismissible homepage dialog uses supplied original food artwork, $10, the selected date, truthful availability and a direct Order link. English and Spanish entrypoints. Session dismissal; bounded retries while another dialog/form is active.
- Daily and regular carts require explicit replacement confirmation. Daily checkout hides unrelated ASAP/scheduled controls. No clinic code, database, credential or payment configuration changes.

## Browser acceptance — isolated local fixture
- Supported Chrome browser, http://127.0.0.1:8789, fixed October 1 10AM Eastern API fixture. Other APIs return 503; checkout is captured locally, never sent to Square.
- First category selected, exactly one Papa Añejo card, quantity 1, $10 subtotal, $5 same-day delivery, $0.70 estimated tax, $15.70 total. Existing $25 regular minimum does not block lunch.
- Existing checkout contact/address fields work; captured payload contains daily_lunch_papa, date 2026-10-01, lunch window and both communication consents false.
- English and Spanish category/cart copy observed. Product description remains the saved catalog language.
- Desktop popup inspected; 390×844 mobile screenshot saved under docs/evidence/daily-lunch-order-2026-10-01/popup-mobile-local.jpg. CTA routed to Papa on normal Order page. Food artwork uncropped.

## Validation and release state
Local validation: npm test — 3,394 passed, zero failures; npm run lint — zero errors, 11 pre-existing warnings; Pages Functions build — compiled successfully; predeploy ancestry guard passed. PR #174 merged as 533cc975e1e30b991797818a8669d3096c6ab4b3 after all three PR checks passed. Cloudflare production deployment 9dcc7af7-3e43-4021-8e50-7a1b816107d5 reports source 533cc97 and Active; production Pages check succeeded. No production purchase or revenue uplift is claimed.

## Rollback / risks
Revert this release commit and redeploy through normal release checks. Existing separate /daily-lunch remains compatible. No DB migration required. Future lunch dates require explicit configured assignments. Popup never advertises a stale past meal when no configured current/future meal is available.

## Current production browser evidence
Supported Chrome observed the new homepage popup on https://anejocateringco.com/ after deployment and reload. Spanish preference was respected. The popup displayed Papa Añejo, Thursday October 1, $10, regular same-day delivery, and linked directly to /order?category=daily&date=2026-10-01.

Following the CTA showed Daily Lunch first, exactly one Papa Añejo card, and its Spanish description. Adding one meal showed $10 subtotal, $5 delivery, $0.70 estimated tax and $15.70 total in the existing sidebar, lunch 11AM–2PM, existing contact/address/consent controls, with unrelated fulfillment modes hidden. No production checkout was submitted. Screenshots: popup-live.jpg and order-live.jpg in docs/evidence/daily-lunch-order-2026-10-01/.

`npm run verify:deploy` could not query the provider because its token/account environment variables are absent. This is not a pass; Wrangler's existing authorized OAuth deployment listing and supported live browser supplied independent deployment and behavior evidence. The generic direct-HTTP live verifier was not repeated after the previously recorded HTTP access denial. No credentials changed or access restrictions bypassed.

Approval needs: none for this requested release. Future unscheduled lunch assignments remain an owner menu decision. Broader marketing automation work remains separate and unfinished. Next: customers can order through the first category; verify paid-order outcomes only from actual order records.
