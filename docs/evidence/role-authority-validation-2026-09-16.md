# Current staff authority validation — September 16, 2026

## Confirmed defect

An in-memory SQLite regression changed an active owner to driver while retaining the existing session. Before the patch, `requireRole(...,['owner'])` still returned owner context instead of 403. Session-cached lead/team also survived roster changes. A staff DB error could bypass the previous active check. These are local reproductions; no live user's permissions were changed or exploited.

Before evidence: `/tmp/anejo-role-refresh-before.log` (three failing regressions, one nonstaff case passing). Source was the shared `functions/_lib/roles.js`: `currentRole` trusted the session and `requireRole` checked its role before reading only `active`.

## Repair

`currentRole` now treats the session as identity and the current active staff row as authority. It resolves current role, team, lead status, ID and email before returning context. Missing/unavailable DB, missing/inactive staff and invalid staff roles fail closed. This covers direct `currentRole` consumers as well as `requireRole`; client/trainer sessions retain previous semantics. No credential writes, sessions invalidated, provider sends or migrations.

Four focused tests cover existing-session downgrade, live team/lead scope, inactive/missing/unavailable records and unchanged client/trainer semantics. All four passed in `/tmp/anejo-role-refresh-after.log`.

## Fixture migration and validation

Initial full run: 2,499 tests; 2,377 passed, 122 failed (`/tmp/anejo-role-refresh-full.log`). The old fake staff lookups frequently returned only `active`; reduced SQLite fixtures lacked current role-context columns. Tests must model authoritative staff rows instead of weakening the production guard with a session fallback.

This author's eight money-fixture updates plus auth regressions passed 83 focused tests in `/tmp/anejo-role-fixtures-local.log`. Other fixture updates and the final full-suite result are coordinated by the main task; this record does not yet assert that final pass. Existing real-session role journeys remain Unverified.

## Remaining scope

Role changes now apply on the next role-context lookup. This does not establish a full endpoint authorization audit: code using `currentUser` directly rather than the shared role resolver still needs independent review. Production DB availability failures now deny staff access by design. Release requires the full updated suite and reviewed fixture changes; no deployment is claimed here.

Final combined validation: 2,499 root tests passed, zero failed/skipped (11.853 seconds), root lint passed with existing warnings, Pages Functions build and diff check passed. Logs: /tmp/anejo-role-final-tests.log, /tmp/anejo-role-final-lint.log, /tmp/anejo-role-final-build.log. Studio source unchanged from previously validated 23-test candidate. Direct currentUser consumers inspected: no additional stale staff-role allow-list bypass found. Separate existing trainer missing-row/DB-error fail-open behavior remains an audit follow-up. Staff query columns exist in migrations 0003 and 0005; no migration required.
