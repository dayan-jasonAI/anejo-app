# Office lunch survey after drop-off

Owner: Codex. Authorization: Dayan's direct-session instruction on 2026-10-05 to attach lunch feedback to office ordering, trigger after confirmed drop-off, remind office staff by SMS in 5–10 minutes, and preserve results on office records. Existing direct-session release authorization applies after checks. No arbitrary test SMS or fabricated delivery is authorized.

## Behavior

The driver completion endpoint records a delayed reminder against the contract ledger order and actual delivery. A unique order/recipient key makes completion retries harmless for reminders. No eligible phone leaves a blocked record. The existing submitter and primary office contact are deduplicated and checked against text opt-outs again at send.

The separate cron sweep runs each minute. Reminder due time is eight minutes after confirmed drop-off; queued reminders older than ten minutes are marked missed rather than sent late. Provider acknowledgements are retained; uncertain sends are never automatically resent. A durable sms_log acknowledgement can recover an interrupted status write. “Sent” means provider acceptance, not confirmed handset receipt.

SMS links carry a random 256-bit capability, expire 24 hours after delivery, and allow feedback only for the delivered office/meal. They do not grant office ordering, patient data, or owner access. Ordinary order-form links still require the existing trusted-device check. Completed-delivery checks apply to both rating modes. Responses retain office, contract order, service date, meal, and actual delivery IDs.

Owner → Contracts → This office's lunch feedback shows scores, mood counts, repeat-meal preferences, menu requests and reminder states. Anonymous response counts are not proof of unique patients. Do not collect patient names or medical details.

## Release and evidence

Release order: focused/full tests and CI, additive migration 0144, Pages merge/deploy, separate cron worker deploy, production access checks and a current scheduled invocation. Production evidence is recorded separately after release. Until then status is local implementation only.

Validation: 22 focused SQLite-backed tests passed. Initial full suite 3,659 passed before the last sender-preflight and no-recipient improvements; final CI/full-suite results supersede that preliminary result. Functions bundle compiled; lint reported zero errors and eleven existing warnings. Tests cover completed-delivery gating, response persistence/idempotency/headcount cap, scoped SMS capability, expiration, opt-outs, competing ticks, no-op transports, uncertain sends and acknowledgement recovery.

## Limits and rollback

A scheduler outage can miss the short reminder window; owner records show missed/unconfirmed/blocked states. No real office reminder or handset receipt has been proven during this implementation. Do not manufacture an office delivery or send unsolicited test messages to establish proof. Validate the first genuine post-release drop-off and staff response before asserting end-to-end real-world adoption.

Rollback code to the previous Pages/cron revisions if release fails; preserve additive reminder/feedback tables and retained responses. Do not remove live records or drop columns. No credential changes or historical-delivery backfill.
