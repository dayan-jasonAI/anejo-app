# Readiness history and driver onboarding — September 16, 2026

Owner: Codex. Read-only investigation; no provider calls, credentials, client records, sends, PIN changes, cleanup or deployment. Only this report was authored. Findings apply to inspected repository code, not an identified driver's delivery history.

## Driver onboarding: actual trigger

`functions/api/hub/owner/staff/index.js`, POST `op:create`, is owner-only. It requires name, recognized role and at least phone or email; an email must pass syntax validation. It creates active staff with an initial PIN, `must_change_pin=1`, invite metadata and a `user.invited` tracking event. Phone-only staff get an internal placeholder address, deliberately not used for email.

After persistence, a submitted phone triggers welcome SMS; a submitted email triggers `sendEmail` with subject “Welcome to the Añejo HUB”. Email includes sign-in URL, role/team and instructions to obtain the one-time PIN from Dayan. The PIN is returned once to the owner and deliberately absent from both messages. This applies to driver and other accepted staff roles, not a separate driver-specific trigger. Updates and PIN resets do not resend onboarding.

`public/hub/owner/staff.html` labels email optional, sends its value at creation, shows the returned PIN, clears inputs and refreshes the roster. A phone-only creation is a valid path that never attempts email. That fact alone does not explain the reported incident: whether the affected driver had an email at creation is **Unverified** without authorized record evidence.

## Evidenced defects and limits

1. **Suppression reported as a send.** `functions/_lib/email.js` returns `{skipped:true,suppressed:...}` for suppressed addresses. Staff creation ignores the returned object and unconditionally sets `notifications.email={ok:true,sent:true}` whenever no exception occurs. Therefore a suppressed message is falsely reported as sent. This is a concrete code defect; no affected production recipient was identified.
2. **Notification errors are invisible in the add-staff UI.** The endpoint catches email exceptions and returns notification failure alongside successful staff creation. The UI reads `r.error` and `r.initial_pin`, but never `r.notifications`. Missing email configuration, provider rejection, suppressed email and SMS no-op/failure consequently have no displayed onboarding status. Staff creation must remain distinct from notification success.
3. **No recovery path in this endpoint/UI.** Supported operations are create, update and reset_pin. Update handles phone but does not accept email, and there is no resend operation. Retrying create after persistence normally encounters unique-email conflict. A safe future resend must be explicit, show a preview under session rules, obey suppression and never regenerate or transmit a PIN as a side effect.
4. **Delivery receipt discarded.** The email helper returns provider JSON, including receipt ID, but staff creation discards it. A no-error provider response establishes acceptance at most, not delivery; the current `sent:true` label has no provider receipt in this endpoint response.
5. **English-only onboarding text.** Creation persists `b.lang`, yet both welcome messages are literal English. Exact required languages for staff onboarding should be checked against the broader EN/ES requirement; this is an observed localization gap, not an established delivery cause.

Recommended bounded repair: preserve account creation and PIN behavior; distinguish accepted/skipped/failed/not-requested email results and retain provider receipt; render notification results; add executable tests for phone-only, suppressed, configured failure, accepted message and UI status. Resend/email-edit behavior requires a deliberate scoped implementation and must not send anything while current communications exclusion remains. No fix or test was implemented in this read-only assignment.

## Historical baseline and migration evidence

- Requested historical path: `/Users/aiagent/Documents/Claude/Projects/Anejo Catering Co. LLC/anejo-app-repo`.
- Current directory listing shows only a `migrations` child directory; there is no `.git` entry. Read-only `git status`, `git log` and root-history commands return `fatal: not a git repository (or any of the parent directories): .git`.
- The active repository reports `git rev-parse --is-shallow-repository` = `true`. Its earliest reachable reverse-log entry is `b83dd85`, June 25, 2026, “Merge pull request #16 from dayan-jasonAI/order-fixes”. This is a shallow-history boundary, not proof that development began there.
- Reachable June 26 history includes `9cd6e51` (“studio: conversation history + resume — never lose a user's work”) and `80f23be` (“brief review: make owner approval reachable + add 'need more info' + staff feedback loop”). These are useful comparison leads, not proof that today's UI preserves every behavior.
- `docs/HUB_SESSION2_ADDENDUM.md` documents owner-issued staff onboarding and mandatory first-login PIN change. Its historical local/live claims are not revalidated by reading it.
- `CLAUDE.md` retains early provision/build notes and mixed historical state. Treat dated artifacts and actual commits as evidence; do not elevate stale “already live” prose to current production truth.

Dayan's attribution of the original copy to Claude/Fable 5 remains user-supplied history. This inspection cannot recover the original June file tree or certify migration completeness. Exact baseline artifact/commit: **Needs Dayan confirmation** or recovery from an authorized versioned source. Do not copy, sync, rename or populate the historical directory based on its name.

## Prior cleanup policy

Targeted repository Markdown searches for cleanup, purge, deletion of test/unpaid orders and related phrases found no exact approved deletion predicate. Existing `docs/CONVERSION_WORK_LOG_2026-09-15.md` says authorization-only historical paid rows were not retroactively reclassified. It does not identify rows safe to delete. Other purge mentions concern customer erasure/access restrictions, not this approved cleanup.

The coordinating task reports a prior cleanup policy was approved. Its exact predicate, exclusions and evidence are not reconstructed here: **Needs Dayan confirmation**. This is missing factual scope, not a request to reapprove the broad work. Do not infer that every pending order is a test order, or that every authorization advanced to paid. Preserve historical money/audit records until an itemized, evidenced correction plan and the original predicate are available.

## Validation and next action

Evidence gathered through source reads, targeted `rg`, directory listing and read-only Git metadata. No tests were required for this report; source defects remain candidates for a separately implemented and tested patch. The specific driver's onboarding attempt, email address at creation, suppression state, provider acceptance and inbox delivery remain **Unverified**. Next: implement truthful notification status locally, then complete account-level investigation only through authorized supported access without sending messages.

## Follow-through patch — local only

The coordinating task subsequently authorized a bounded repair. Staff creation now treats suppressed email as skipped, retains the provider receipt when accepted, and reports missing receipts as failure. The owner UI displays separate email/SMS outcomes after creation, with EN/ES status wording and explicit delivery-unconfirmed wording. No resend operation, trigger, credential behavior, staff pay fields or production action was added.

Six executable tests use real in-memory SQLite and mocked provider responses: suppressed/no request, provider rejection with staff preserved, acceptance/receipt/no PIN in email, missing receipt, phone-only/no email, and rendered-status function behavior. All six passed; `/tmp/anejo-staff-onboarding-20260916.log`. Earlier investigation findings above describe the pre-patch code; acceptance in the live app and the specific driver's cause remain Unverified. The patch does not add resend or email editing, localize the outbound welcome, or establish inbox delivery.
