# Recorded final payment and event feedback

Direct session scope: repair misleading post-checkout confirmation for fully paid catering, prepare a planning-service check-in and a review request after actual delivery. The owner already handled the personal apology; no second apology is sent by this change.

## Payment return

The hosted quote derives confirmation only from saved deposit/final-payment state, never `paid=1`. Fully paid bookings show paid in full, no outstanding payment invitation, and the stored event date/serving time. Deposit-only, waived, processing, conflicting records and storage outages remain distinct. Pending confirmation suppresses another checkout and performs at most six read-only checks, preserving focused edits. Existing outbound quote emails remain unchanged unless rendered specifically as a hosted payment record.

## Event care

Migration0160 adds recipient-bound, expiring feedback tokens; per-booking exact reviewed drafts; feedback records; and runtime proof. Staging sends nothing. Future trigger approval binds recipient, quote/event, current template, feedback URL and actual Google destination. A changed recipient rotates access; expired links are not silently revived.

The pre-event email concerns booking/planning, only for a fully paid booking on the day before its event. The post-delivery review waits60 minutes after a current completed owner/staff delivery and matching execution transition. Event date alone cannot trigger it. It asks for honest food/service feedback and exposes the same Google review option regardless of score. No reward, incentive or rating filter is introduced.

The existing every-minute catering-outbox endpoint invokes the bounded lifecycle runner. Only specifically approved booking drafts can send. Durable sending/unknown claims block blind retries, recorded receipts distinguish provider acceptance from delivery, and Hub messages/feedback preserve event lineage. `catering_lifecycle_runtime` stores last tick, last success, last error and accepted count; configuration alone is not executor proof.

## Release gates

Apply only additive migration0160 before the dependent app release. Preserve tables, draft/receipt history and customer records on rollback. Release uses exact-head hosted checks, merged source and production source/readback. Current private evidence and communication approvals are held outside this public repository in the session deliverables folder. New client emails remain staged until the owner sees and approves their rendered previews.

Validation includes real-SQLite/provider-stub state, race and privacy tests; production-CSP browser tests for payment returns and owner/public feedback at phone/desktop sizes; root full suite, lint and Functions build. Final local/hosted/live results are recorded in the private session evidence rather than inferred from this implementation note.
