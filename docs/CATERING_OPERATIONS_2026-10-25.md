# Catering operations integration — October 25, 2026

Status: local source and focused tests verified. Deployment and live customer operation are not established by this document. No customer messages, calendar bookings, production data changes or provider calls were made by the operations backend agent.

## What changed

- Paid catering quotes join the existing kitchen order-board response as `catering_board`; they are not copied into retail orders or routes. Exact saved quote line quantity and SKU are retained.
- The existing kitchen PIN endpoint starts catering prep and marks ready. Named active staff identity is checked again at mutation time. PIN prep activation, execution transition and audit are one transaction.
- Per-dish `pending → preparing → cooked → packed` records include actual counts, staff identity, versions and immutable operation events. A planning checkbox cannot mark food cooked or packed.
- Current packing readings and carriers plus actual packed counts gate readiness. Pickup and delivery readings gate driver departure and completion. An explicit ambient handling note is supported; numerical readings do not automatically certify food safety.
- Driver handling forms use the signed-in assigned driver's identity and durable request recovery. The record's version is kept separate from assignment and execution versions.
- Purchase rows are editable for this event only; additions, quantity edits and removed/purchased statuses are audited. Unmapped dishes remain visible as unresolved purchase entries, so the main item cannot disappear silently.
- Purchase scaling uses exact catalog SKU mapping to an owner-approved immutable recipe version, owner-confirmed sale-unit factor and approved yield. A name match or legacy published flag is reference material only. Unknown tray units are never replaced with guest count.
- Container capacities and serving equipment remain visibly provisional planning allowances. Unknown sale units produce a confirmation entry instead of invented packaging counts. Existing approved logistics are kept separate from measured handling records.

## Files

Schema: `migrations/0161_catering_operations.sql`.

Core: `functions/_lib/catering_operations.js`, `catering_execution.js`, `catering_assignment.js`, `event.js`.

Routes: `functions/api/hub/kitchen/orders.js`, `event.js`, `functions/api/hub/driver/catering.js`.

Driver UI: `public/hub/driver/catering.html`.

The parent agent owns notifications, calendar reservations, labels and deployment; separate agents own event-board interfaces and recipe authority. Inspect current shared working tree before further edits.

## Evidence

Local commands executed successfully after the relevant changes:

- `node --test test/money/catering-operations.test.js test/money/catering-execution.test.js test/money/catering-assignment.test.js` — 43 passed, zero failed.
- `node --test test/ui/catering-driver.test.js test/money/event-production.test.js` — 70 passed, zero failed.
- Focused ESLint across changed backend routes/helpers and the three associated test files — exit 0.

Tests use real local SQLite, synthetic quotes/specifications and stubbed providers. Coverage includes concurrent stale writes, audit rollback, active-staff revocation, changed quote invalidation, PIN secrecy, actual count/handling gates, assigned-driver flow, exact approved-recipe scaling, unknown units, safe recovery after unknown outcomes and activation rollback.

## Remaining limits and release checks

- These tests are not proof of a live release. Parent must run the complete release checks and verify deployed authenticated kitchen/owner/driver surfaces.
- A quoted quantity such as `2 trays` remains intentionally unresolved for production readiness until the owner records unambiguous sale units on the quote; the system cannot infer portions or tray yield from guest count.
- Packaging allowances require kitchen confirmation; no rental, chafing equipment inclusion or fee is assumed.
- Current recipe authority records must come from owner review, not test fixtures or imported legacy publication status.
- Historical completed events are not reopened or notified retroactively. Existing legacy non-activated workflows retain compatibility; new PIN prep and operational edits activate the actual-record gates.
