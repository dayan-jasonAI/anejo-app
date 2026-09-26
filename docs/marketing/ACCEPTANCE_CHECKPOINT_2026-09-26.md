# September 26 acceptance checkpoint

Dayan authorized continuing all remaining readiness work. This checkpoint is partial evidence, not full-goal completion.

## Current browser observation

Normal supported Chrome opened public `/order`. Cart initially empty. Lechón plate displayed $14.00, with 6 oz lechón, 8 oz congrí and 3 oz salad. Customizer quantity two displayed $28.00; adding it produced $28 subtotal, $5 displayed delivery estimate, $1.96 estimated tax and $34.96 estimated total. These are displayed estimates, not an independent tax determination or Square calculation. No extras were automatically added. Delivery panel selected scheduled mode and displayed advance-notice guidance. Transactional and promotional SMS opt-ins both unchecked. No personal details entered, checkout not submitted, no payment link created. Temporary two-item cart removed through the UI; empty-cart message verified.

## Remaining acceptance boundaries

- Non-owner kitchen/driver/staff/marketing/vendor/client/trainer rendered navigation and cross-user isolation require appropriate designated existing sessions. Do not create production accounts or change roles merely to test. Local authorization tests do not establish browser acceptance.
- Checkout still needs full quantity/edit/discount/address/language/error matrix. Production checkout creates records/payment links even without payment; use local fixtures for submission and provider errors.
- Paid confirmation to kitchen to driver chain needs locally seeded data with stubbed payment/email/push, plus separate authorized live role acceptance. No settlement or delivered notification is proven here.
- Main microphone and playback acceptance remains open. A discovered generic speech error message obscures permission/network failures; a narrowly scoped local repair is in progress, not deployed.
- Google review integration still needs confirmation of approved Business Profile API authorization versus website-only access.
- Audit v12 candidate preserves unknown status for missing written authority and clarifies explanations. PR release checks pending; model semantic reliability and automatic trust approval remain unaccepted.

Source review references: `docs/MARKET_READINESS_REQUIREMENTS_2026-09-16.md`, `docs/READINESS_WORK_LOG_2026-09-16.md`, `test/auth/role-refresh.test.js`, `test/money/staff-order-notifications.test.js`, `test/money/kitchen-ready.test.js`, `test/ui/order-confirmation.test.js`. Those tests are existing coverage, not new execution claims from this checkpoint.

## Additional direct confirmation-page finding

A normal direct visit to `/order/confirmed` with no receipt capability correctly refused to verify payment, but a separate push fallback falsely promised order-update emails. Root fixed the missing-contact branch to state notification status cannot be confirmed and link to the account in both English and Spanish. No user data was entered. Local candidate only until subsequent release readback.

Added one combined real-handler/migrated-SQLite test for authorization versus captured payment, receipt state, kitchen prep, photo prerequisite, ready/clear, driver acceptance and repeated webhook. Root reviewed the test and reran it: 1/1 passed, outbound fetch blocked and asserted zero. Photo metadata and route offer are seeded boundaries; this does not test actual uploads, dispatch creation, provider settlement or delivered notifications.
