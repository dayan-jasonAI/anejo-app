# Catering quote follow-up — October19,2026

Dayan directly authorized one quote reminder plus Hub follow-up/response controls. Customer send remains gated by the rendered-message review required by workspace I12. Engineering, additive database setup and release are authorized; this is not approval for unattended customer sequences or repricing.

## Behavior
Owner service desk separates internal call tasks from customer response status: awaiting reply, replied, call requested, changes requested, declined. Three fixed EN/ES steps (review quote, clarify questions, final check-in) each require a fresh actual rendered preview and explicit approval. Later steps require an accepted predecessor and at least48hours spacing. No cron/customer auto-send or automatic closure is introduced.

Read-only preview binds recipient, current quote/version, reviewed template/content and contact state with a digest. Paid/closed/past/invalid-recipient/revised/suppressed/opted-out/replied/callback/change-request states are blocked. Final durable send claim rechecks safety gates; lead-wide pending/unknown outcomes block later reminders, including across quote revisions. One durable attempt per quote/step and provider idempotency identity prevent duplicate sends. Network uncertainty is not automatically retried.

Provider acceptance is saved before atomic projection to canonical Hub email conversation and activity ledger. Acceptance is not delivery or reading. A replay can repair local projection without resending. Owner response notes do not overwrite call notes or payment state. Paid deposits remain separate from owner-marked wins. Overview is explicitly limited to the latest100inquiries; historical timestamps do not establish opens or revenue uplift.

Owner next-action routing changes for replies/call requests/changes; declines/booked/closed leads stop chase alerts. Accepted reminders defer default checkpoint48hours unless the owner supplied another follow-up. General email replies to the owner inbox are not automatically ingested; current guards use Hub inbound messages and owner response records. External replies must be reviewed/recorded before sending another reminder. A complete unattended inbox-to-booking loop is not established by this change.

## Release order
Apply only additive migration0153_catering_quote_followup.sql after checks, before releasing dependent code. Do not replay historical migrations: production migration bookkeeping does not represent already-existing schema. Migration creates empty follow-up/response tables and sends no messages. Preserve existing acknowledgements and customer quotes.

Validation:3,847localtests passed/0fail/0skip,lint0errors/10existingwarnings,Functionscompilepassed.39focusedtests include realSQLitehandler concurrency/replay, late-paymentrace, staleapproval, reply/optout/closed gates, unknown blocking and independent call-note preservation. UI requires current iframe load before review; timeout/error/staleframe cannot enable sending. Isolated production-CSP desktop/mobile acceptance uses synthetic intercepted requests only. Production release/live acceptance and actual customer send require final receipts retained outside public repository.
