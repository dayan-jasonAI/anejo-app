# Catering staff-driver handoff — September 27

Status: implemented locally; production release blocked. This extends the deployed owner-delivery/pickup increment. It does not establish real customer delivery or notification success.

## Behavior

Owner confirms Staff driver mode, travel/setup and food handling in the event production page, then assigns an active staff driver. The driver sees date-filtered assignments in Driver → Catering, accepts or declines, checks every current menu line at pickup, records departure/arrival and confirms physical handoff. Kitchen must first be packed and ready. Completion requires a previously recorded paid/waived/zero balance; no payment action is performed.

Assignment, execution and audit changes share a database transaction and durable request receipts. Concurrent/repeated saves cannot silently create a second assignment or advance twice. Current active staff identity and assignment ownership are checked server-side. Owner cannot impersonate driver progress. Owner release needs a reason before departure; reopening invalidates prior packing/pickup confirmation. Recovery payloads are scoped to the verified actor and assignment/quote, and unavailable browser storage blocks new assignment/driver writes.

No customer/driver notification, ordinary route/order, payroll or money mutation is enabled. Staff must open their Hub; assignment is not proof of an alert. Individual temperatures/carriers remain outside this increment.

## Evidence and limitations

- Actual SQLite tests cover populated migration preservation, atomic races, rollback, role boundaries, exact package keys, reopen invalidation and idempotent actions.
- Authenticated real route-handler test performs configure → assign → prepare → pack → accept → confirm pickup → depart → arrive → complete and independent driver/owner/history reload. It asserts zero external fetches, no ordinary order/route/delivery rows and unchanged quote money fields.
- Actual browser scripts are exercised in VM tests for rejected saves, lost acknowledgements, storage failure, stale reads, actor isolation, bilingual controls and date selection.
- Supported Chrome local owner acceptance reached staff assignment, preparing and packed-ready for fictional cq_qa. Screenshot: evidence-2026-09-27/catering-staff-local-ready.png. Driver browser redirected to local login, then Chrome returned ERR_BLOCKED_BY_CLIENT; that browser action was stopped. The local QA fixture was missing authenticated:true, corrected afterward but not browser-retried. Full driver browser acceptance remains Unverified.
- Production D1 read-only preflight for the preceding migration0138 returned error7403: The given account is not valid or is not authorized to access this service. No subsequent production mutation attempted. Do not bypass or alter credentials.
- Live Hub remains signed out; native inventory also reported Mac locked. Authentication and production role acceptance are not proven by local tests.

## Release order and rollback

PR153 composer receipt repair remains first, pinned b651f27446843b31ca69e54603fcfce6ed48b4c8; its checks succeeded but migration0138 and merge are blocked. Staff-driver work is isolated on codex/catering-staff-handoff after an automatic local sync commit, preserving PR153 remote head.

After normal account access is restored: confirm schema and backup using approved existing tools, apply0138 and finish PR153; separately review0139 and this candidate's checks before release. Migration0139 rebuilds execution to extend its CHECK constraint while preserving rows/history; local populated SQLite transaction/FK checks pass, production D1 application remains Unverified. Do not apply the complete historical migration backlog. Application rollback must preserve all execution/assignment/history/receipt tables. If driver-mode records exist, reverting to a version that understands only owner/pickup requires a separate operational recovery plan.

Approval: Dayan's direct-session authorization covers implementation and deployment after checks; excludes customer communications, charges and credential changes. No new publication/notification approval requested or assumed.

Final local suite: **3305 passed, zero failed**. Lint: zero errors,11 existing warnings. Functions build succeeded. Commands, logs and source SHA256s are preserved in `evidence-2026-09-27/catering-driver-validation.json`. Studio source was not changed by this slice; previous23 results are historical, not rerun here.
