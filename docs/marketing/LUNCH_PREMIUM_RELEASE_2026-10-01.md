# Premium daily lunch / group delivery — October 1, 2026

Dayan direct-session authorization: polish Añejo ordering with UI/UX Pro Max, ensure checkout works, encourage groups, free delivery for over five meals. Subsequent clarification: free delivery for 6+ and advance preorders throughout the service area; tips encouraged but optional. Use 4342 Clinton Blvd as delivery-pricing reference, NOT actual Boca kitchen location.

## Implemented locally
- Branded date select, labeled 48px quantity steppers, keyboard focus and reduced-motion support; premium daily card remains stacked on mobile rather than inheriting compact regular menu rows.
- Dynamic group savings message, quantity controls in cart, amount shown in continue button, guest checkout clarity.
- Server validated quantities 6–20 receive free daily delivery; 1–5 retain existing configured fee, advance preorders remain free. API publishes threshold. Other order types/clinics unchanged.
- Guest email prefilled into Square. Existing card and eligible Apple/Google/Cash App options and optional tipping preserved.

## Evidence
3,396 local root tests passed; lint no errors, existing warnings; Functions build passed. Final focused22 tests also pass after guest-email/optional-tip assertions. Tests exercise actual checkout handler with mocked Square, fee amounts and kitchen persistence at quantities1/5/6/20, invalid quantities, UI5-to6-to5 repricing. Not evidence of real payment completion.
Supported Chrome local fixture verified responsive controls at390px with no horizontal overflow, quantity/cart free delivery, and desktop layout. Production rollout/live acceptance pending.

## Information still required
Distance-based pricing: city/ZIP for the reference point, fee bands and maximum delivery distance are Needs Dayan confirmation. No guessed mileage fees or altered kitchen routing origin. Existing price applies until those facts are supplied.

## Release/rollback
No migration or credentials/config changes required. Roll back by reverting this release and redeploying after gates. Production payment must not be charged in acceptance. Production link creation has a pending-order side effect and abandoned recovery; a QA record must have contact suppressed and be canceled immediately after inspecting checkout.
