# Catering lead, conversation and quote repairs — October 17, 2026

Owner: Codex. Branch: `codex/catering-lead-conversation`, based on fresh `origin/main` / deployed `e711faa`.

## Observed incident (production read-only)

Latest catering request was stored October 17 at 2:56:57 p.m. Eastern. Its owner Hub alert was inserted and owner email accepted by 2:56:58. Those records do not prove device display, inbox delivery, or reading. Quote creation was recorded at 8:10:56 p.m.; email/SMS timestamps at 8:11:12. No corresponding SMS log or conversation existed in the inspected records. Customer and contact details are omitted from this report.

The outbound SMS used an invented thread reference instead of a persisted thread. `sms_log.thread_id` has a foreign key to `threads`, and logging swallowed insertion errors. The quote timestamp alone cannot establish the exact provider message or delivery. Intake queued only owner notifications, with no customer acknowledgement. There was no catering lead response deadline/call reminder, and no owner quote revision workflow.

## Implementation

- Canonical owner-only catering conversations, inbound phone matching, direct lead replies, opt-out enforcement, durable per-request/quote SMS claims and ambiguous-outcome blocking.
- Provider receipt/status display, signed carrier callbacks and independent early-callback storage. Historical reconciliation imports actual Twilio body/SID/status only after exact recipient/token/time matching; it never sends.
- Unpaid quote revisions retire the prior Square checkout, verify the canceled order without tenders, and create a deterministic recoverable replacement. Paid terms are preserved. Revision journal suppresses stale hosted payment controls.
- Optional croqueta packs use available live catalog prices, stay outside base quote/deposit totals, and invite a customer change request before repricing.
- `/hub/owner/catering-service.html`: call actions, conversation access, receipt sync, status/notes and scheduled follow-up. First-response reminders after 15 minutes; unpaid-quote follow-up after 24 hours, then hourly owner escalation while due. Recorded calls may set another date. Owner-marked wins never claim recorded payment.
- Acknowledgement email has EN/ES rendered previews and owner activation. Default OFF; activation applies only to future inquiries. Suppression and immutable provider idempotency keys apply. No historical inquiry is automatically emailed.

## Approval and exclusions

Dayan's direct instruction in this chat authorizes the catering UX, messaging trace and follow-up repairs; prior release authorization remains in force after release checks. No client quote content/amount was changed during this work. No customer message, charge, credential change or provider configuration edit performed. New automatic customer acknowledgement remains off until Dayan reviews and activates the exact preview. Further customer persuasion/follow-up messages remain owner actions.

## Validation and release record

- Full root release run: **3,743 passed, zero failed**; deploy ancestry guard passed. Log: `/tmp/anejo-catering-release-check.log`.
- Full lint: zero errors, ten existing warnings. Log: `/tmp/anejo-catering-eslint.log`.
- Real migrated SQLite/provider fixtures cover revisions, race/recovery, consent/STOP, SMS replay, provider reconciliation, acknowledgement activation and callback ordering.
- Local rendered browser acceptance: **Blocked — needs proof**. Bundled Chromium executable absent; installed Chrome launch aborted with EPERM/SIGABRT. No browser permission bypass attempted. Isolated synthetic desktop/mobile browser acceptance is included in CI, with screenshot artifacts; its result must be recorded before release.
- Release order: migrations `0147`, `0148`, `0149`, `0150` before deploying Functions, then exact-revision deployment/public checks. Additive migrations preserve existing quotes. No bulk customer-send or quote modification is part of deployment.

Production release and authenticated owner workflow remain **Unverified** until subsequent evidence is appended. No sales/deposit increase is claimed.
