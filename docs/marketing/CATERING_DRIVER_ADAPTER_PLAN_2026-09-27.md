# Catering staff-driver adapter — implementation handoff

Date: 2026-09-27. Status: proposed implementation; no adapter or dispatch activation claimed.
Owner: root integration agent; bounded implementers receive exclusive file ownership below.

## Purpose and evidence

Support a catering booking in the existing driver Hub without manufacturing an order, payment, route payroll entry, or notification. Current owner-operated execution and customer pickup remain separate supported paths.

Inspected source:
- `functions/_lib/routing.js`: `assignRoute` inserts ordinary order stops, estimates pay, then attempts offers.
- `functions/_lib/dispatch.js`: `sendOffer` attempts push, SMS, and inbox messages.
- `functions/api/hub/driver/route.js`, `pickup.js`, `stop.js`, `delivery/complete.js`: order joins and ordinary delivery semantics; pickup creates bowl records, completion updates orders and invokes notices.
- `functions/_lib/notify.js`: absent consented SMS recipient can fall back to customer email. An SMS-only switch is insufficient.
- `migrations/0003_hub.sql`: ordinary route stops reference orders.
- `migrations/0137_catering_execution.sql`: execution delivery mode currently permits only owner_self/pickup.

These are source observations, not a live driver acceptance result. Existing driver routes must continue unchanged during the first slice.

## Ownership boundaries

Backend implementer: new assignment migration, `functions/_lib/catering_assignment.js`, `functions/api/hub/owner/catering-assignment.js`, `functions/api/hub/driver/catering.js`, and `test/money/catering-assignment.test.js`.

UI implementer: new `public/hub/driver/catering.html`, dedicated UI tests; coordinate explicit ownership before editing driver dashboard/navigation or owner event page.

Root: schema migration review, execution-helper integration, release checks, provider migration/deploy, browser acceptance, evidence log. Never edit the same file concurrently. Pick the next unused migration number after current release; do not assume 0138 remains free.

## Schema contract

1. Add `catering_assignments`: id, quote_id FK, driver_id FK, status, version, execution_version, quote_snapshot, assigned_by, assigned_at, accepted_at, released_at, completed_at, created_at, updated_at. Allowed status: assigned, accepted, declined, released, completed. Unique active assignment per quote via partial unique index for assigned/accepted. No pay, payout or order fields.
2. Add `catering_assignment_events`: id, assignment_id FK, quote_id, actor_staff_id, actor_role, operation, from_status, to_status, version, idempotency_key, request_json, note, recorded_at. Unique assignment/version and quote/idempotency key. Audit and mutation commit atomically.
3. Add `catering_package_confirmations` only if per-line pickup confirmation is implemented in this slice: assignment_id, immutable quote snapshot, line_key, confirmed_by, confirmed_at; unique assignment/snapshot/line. These are catering packages, not `order_bowls`.
4. Extend execution delivery-mode constraint to `staff_driver` using a reviewed table rebuild migration preserving every row and current transition history. Verify migration from populated v0137 SQLite fixtures and FK integrity. Do not expose staff_driver before both backend and driver UI exist.
5. Notification drafts, if included: separate table with unique assignment or execution transition + recipient + channel, rendered content, source snapshot, status default draft. No scheduled sender, outbox processor, provider call, or enablement flag activated by this migration.

Do not insert into orders/routes/route_stops/deliveries or finance tables. Do not alter payment status. Do not auto-geocode or promise ETA; directions links may use the confirmed address, with no computed arrival time.

## HTTP contract

All writes accept `expected_version` and `idempotency_key`; retain the key after an uncertain response. Canonical request includes authenticated actor. Same-key identical replay returns authoritative state and replayed:true; conflicting key returns409. Validation400, unauthenticated401, unauthorized403, missing404, stale/illegal transition409. Mutation and event audit are atomic. Successful transport alone is not evidence of a sent notice.

### Owner endpoint

`GET /api/hub/owner/catering-assignment?quote_id=...`

Returns `{ok, assignment:null|record, drivers:[{id,name,available}], execution_version, available_actions, blockers, notifications:{enabled:false,sent:false}}`. Only active drivers returned; availability is informational, not proof of capacity. Do not expose phone/contact details beyond operational need.

`POST /api/hub/owner/catering-assignment`

- Assign: `{quote_id, op:'assign', driver_id, expected_version:0, expected_execution_version, idempotency_key}`. Paid valid future/today quote, current configured handling/snapshot, staff_driver mode, active driver required.
- Release: `{quote_id, assignment_id, op:'release', expected_version, idempotency_key, note}`. Before physical departure only, reason required. Do not silently revoke an in-transit assignment.
- Reassign is explicit release then new assignment, each audited. Never change driver on an existing accepted/in-transit record.

Owner assignment itself sends nothing. The driver discovers it inside the Hub.

### Driver endpoint

`GET /api/hub/driver/catering?date=YYYY-MM-DD` returns only assignments for authenticated staff id, including scheduled future assignments within a bounded range; does not replace ordinary routes. Optional assignment_id fetch remains identity-scoped. Driver cannot read another driver's customer address by changing an id.

`POST /api/hub/driver/catering`

Body `{assignment_id, op, expected_version, expected_execution_version, idempotency_key, ...}`.

- `accept` / `decline`: own currently assigned record; decline reason optional. No automatic reoffer or reliability-counter mutation.
- `confirm_pickup`: own accepted assignment, execution ready, current snapshot and handling/packing confirmed; confirm exact catering package line set. Missing package blocks departure and records an internal issue.
- `depart`: accepted assignment plus complete current package confirmation; atomically advances execution ready→en_route with actor audit. Re-read eligibility inside CAS.
- `arrive`: own active assignment and execution en_route→arrived.
- `complete`: explicit physical handoff confirmation; execution arrived→completed and assignment completed atomically. Apply the current recorded-balance completion gate. Never collect or waive money here.

Do not call the existing owner-only `mutateExecution` with a fabricated owner context. Extract a narrow shared transactional transition primitive retaining actual driver identity and assignment predicates, or implement an explicit driver branch reviewed by root.

Reopening execution invalidates existing pickup confirmations; driver cannot depart again until current handling, packing, and pickup are reconfirmed. Completed records immutable. Past events remain archival; no fabricated historical operational timestamps.

## UI acceptance

Owner event page shows assigned driver, actual acceptance state, current progress and outstanding blockers. Label internal recording versus notification delivery explicitly. Staff driver page lists catering alongside ordinary route entry points, not inside bowl checklist. Show confirmed menu/package quantities, time and address, instructions, current state, named actions, error recovery, accessible controls and Spanish parity. Preserve idempotency key across refresh for uncertain saves.

Driver compensation: display no invented amount and do not mark paid; surface that catering compensation is not managed by this slice. Operations must not infer assignment creates a payroll commitment.

## Notification boundary and later gate

Defaults remain `enabled:false,sent:false`. No customer or staff push/SMS/email/inbox send is authorized by this plan. No calls to existing sendOffer or notify helpers. Draft preparation does not activate messages.

A later separately authorized sender requires: owner-reviewed rendered template and scoped authorization record; verified recipient mapping and channel consent; separate staff/customer enablement; transactional unique outbox event; durable provider acknowledgement; explicit failed/uncertain states without blind retry; delivery evidence distinguished from provider acceptance; stale event suppression; independent kill switch. Email fallback must not bypass a disabled SMS/customer communication setting.

## Required tests and release evidence

Use actual migrated SQLite via test/helpers/sqlite-d1.js, not SQL string mocks:
- Populated migration preserves execution/audit records; FK checks pass.
- One active assignment per quote under simultaneous assignment attempts.
- Same-key replay, conflicting-key rejection, stale version and rollback on audit failure.
- Driver role revoked/inactive, unrelated driver, kitchen write and unauthenticated access denied.
- Unpaid/void/past quote and changed menu/address/allergies/time block advance.
- Accepted assignment and exact package set required before departure.
- Reopen invalidates confirmations; release/reassignment cannot steal an in-transit event.
- Completion balance gate and duplicate completion do not touch finances.
- Fetch spy records zero network calls; no orders/routes/payroll/provider logs created.
- Existing ordinary driver tests remain green; list/dashboard renders both independent paths.
- UI retries retain same request; reject/offline responses never render success.

Release requires full root/Studio checks, migration dry-run against populated fixtures, independently reviewed diff, authorized deployment path, and browser verification using designated test records/accounts without customer messages or charges. Record local evidence, deployed revision, and live observations separately. No success or order-uplift claim follows from this plan alone.
