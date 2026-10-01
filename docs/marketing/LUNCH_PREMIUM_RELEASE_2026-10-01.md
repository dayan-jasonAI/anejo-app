# Premium daily lunch / group delivery — October 1, 2026

Dayan direct-session authorization: polish Añejo ordering with UI/UX Pro Max, ensure checkout works, encourage groups, free delivery for over five meals. Subsequent clarification: free delivery for 6+ and advance preorders throughout the service area; tips encouraged but optional. Use 4342 Clinton Blvd as delivery-pricing reference, NOT actual Boca kitchen location.

## Implemented locally
- Branded date select, labeled 48px quantity steppers, keyboard focus and reduced-motion support; premium daily card remains stacked on mobile rather than inheriting compact regular menu rows.
- Dynamic group savings message, quantity controls in cart, amount shown in continue button, guest checkout clarity.
- Server validated quantities 6–20 receive free daily delivery; 1–5 retain existing configured fee, advance preorders remain free. API publishes threshold. Other order types/clinics unchanged.
- Guest email prefilled into Square. Existing card and eligible Apple/Google/Cash App options and optional tipping preserved.

## Evidence
3,396 local root tests passed; lint no errors, existing warnings; Functions build passed. Final focused22 tests also pass after guest-email/optional-tip assertions. Tests exercise actual checkout handler with mocked Square, fee amounts and kitchen persistence at quantities1/5/6/20, invalid quantities, UI5-to6-to5 repricing. Not evidence of real payment completion.
Supported Chrome local fixture verified responsive controls at390px with no horizontal overflow, quantity/cart free delivery, and desktop layout. PR175 merged as b9f84c09e2c4a51cee4c1f4b61e41a1bb24d45d7; production deployment759e36f2-8801-4b2c-a984-51b8d5e71f14 Active. Live UI displayed refined controls and 6 lunches with free delivery/$64.20 estimate. Live payment handoff FAILED as recorded below.

## Information still required
Distance-based pricing: city/ZIP for the reference point, fee bands and maximum delivery distance are Needs Dayan confirmation. No guessed mileage fees or altered kitchen routing origin. Existing price applies until those facts are supplied.

## Release/rollback
No migration or credentials/config changes required. Roll back by reverting this release and redeploying after gates. Production payment must not be charged in acceptance. Production link creation has a pending-order side effect and abandoned recovery; a QA record must have contact suppressed and be canceled immediately after inspecting checkout.

## Checkout blocker discovered during live acceptance
Normal browser test after address confirmation returned HTTP502 text/html: Cloudflare Bad Gateway at /api/checkout (observed October1 04:54:35UTC). Worker tail outcomeok with502 and no exceptions; exact underlying Square response was not logged, so root cause remains Unverified. Initial reserved .invalid email then reserved example.com both failed; no customer charge was attempted. Production D1 query filtered to unique customer_name QA Lunch20261001 0453 (with space between Lunch and20261001 in actual name) found zero orders. No payment-completion claim.

Follow-on repair adds safe provider status/code/category/field diagnostics without customer data, plus user-friendly recovery for HTML gateway responses. Does not bypass provider authentication or change credentials. Distance pricing remains information-blocked.
