# Commissary actual-use records

The owner supplied a QR sign-in sheet. Its destination is a Google Forms **actual-use sign-in**, not a reservation calendar. It timestamps submission and emails a response copy. It asks for identity, business, license and services used; it has no date/duration/reservation inputs. Its own stated frequency is not independently verified regulatory guidance.

## Behavior

`/hub/kitchen/commissary.html` uses `/api/hub/kitchen/commissary`, restricted to current active kitchen and owner staff. Kitchen staff see and update only their own visits; the owner sees the team and may review or correct an existing visit. Owner edits of actual times require a reason and explicit factual confirmation. Start/end use server timestamps; staff cannot backdate them. A forgotten open visit beyond 24 hours needs an owner correction rather than a guessed finish. Actual visit overlap is blocked for the same person. Open visits are excluded from completed-hours totals. ET monthly totals clip visits crossing month boundaries and aggregate the full month even when history displays only the latest 500 rows. Owner totals are explicitly staff-hours and staff-visits, not unique kitchen occupancy: concurrent people contribute separately.

All mutations use stable actor-bound request identity, current record version, active-role guards and one transactional D1 batch containing the receipt, update and audit. Failed CAS/overlap/permission checks roll the complete batch back. Audit events have append-only database triggers. Owner corrections preserve the previous record and invalidate the external-form submission status for deliberate reconciliation.

The Google Form is a plain external link. This code does **not** submit it. An ended visit can be marked `user_reported_submitted` only after the operator confirms actual use and their personal form submission. A reference note can identify the response email; the UI explicitly distinguishes that statement from independent provider verification. No compliance badge or reservation claim is made. No attendance is inferred from a catering event, production estimate, checklist, calendar plan or monthly quota.

The owner may save form-profile details for staff reference. Blank fields remain drafts; no license is invented. Visits retain the profile snapshot present when started. The actual business/license details must be supplied and reviewed by the owner.

## Integration

Apply **only** additive migration `0166_commissary_usage.sql` before releasing dependent routes. No attendance rows are created by the migration. Root integrates navigation links. Event reservations remain a separate module and require the actual reservation destination and provider readback. Do not use the Forms URL as a calendar ID. A recurring plan needs actual owner-supplied days/times; no automatic monthly or weekly usage is scheduled or attested by this module.

## Acceptance

- `node --no-warnings --test test/money/commissary-usage.test.js`: 11 tests pass against every real SQLite migration.
- `node --check public/hub/kitchen/commissary.js`: passes.
- Focused ESLint of the library, API and tests: zero errors/warnings.
- Private joined browser acceptance uses the real migrated API with synthetic owner records under production CSP, 375 px mobile / 1440 px desktop, EN/ES. It proves start, lost-ack retry with same identity, exactly one visit/start audit, actual finish, explicit user-reported submission, owner review, no horizontal overflow, zero external calls and no browser errors.

Private screenshot/test evidence: `Aether/anejo-deliverables/catering-refinements-2026-10-26/commissary/`. These are local tests, not live provider/production acceptance. No real third-party form submission, reservation or attendance row was created during engineering.
