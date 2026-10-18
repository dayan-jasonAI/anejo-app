# Customer quote self-service — October17,2026

Direct-session request: correct dish images in catering quotes, direct customer modifications, delivery-only clarity, preferred calls and calendar workflow. Branch codex/customer-quote-self-service based on production1e26ae4. Existing owner repair PR209 supplies safe Square retirement/replacement.

## Implemented

Shared live-catalog photo enrichment for future emails and hosted quotes. Exact mappings restore the actual three manually entered historical dish names without guessing similar dishes. Public image URLs verified200 image/webp. Missing images no longer leave empty thumbnail boxes. Original line amounts remain unchanged.

Token-authorized preview/apply flow: server-owned quoted rates for existing numeric quantities, current available fixed-price catering/traditional catalog additions, no caller money/identity authority. Review fingerprint and source version prevent stale/tampered acceptance. Old Square order checked/retired/confirmed canceled before deterministic replacement. Paid booking/payment races blocked. Unknown outcomes recover only frozen customer-approved revisions; owner revisions cannot be resumed by clients. Original email links redirect to completed replacement, and interrupted edits can resume. No auto-send or charge on saving. Quotes with custom fee/tax/discount lines or unsupported quantities require review, not guessed recalculation. Paid orders retain their agreed terms and can request a call.

Delivery-only wording and explicit delivery-fee-pending notice when not itemized. New fee proposal remains draft in CATERING_DELIVERY_PRICING_RESEARCH_2026-10-17.md; existing quote not repriced.

Preferred callback time requests: Eastern time with DST validation, quote-token scope, request idempotency and atomic request/outbox, deduplicated owner alert. Hub agenda at /hub/owner/callbacks.html linked from catering service desk. Status remains requested/awaiting confirmation. Calendar/confirmation/reminder outbox is disabled. No real Google appointment/customer message created.

## Remaining blocked work

Google Calendar runtime integration is implemented in the follow-up release described below; it cannot borrow Codex connector permissions. User selected dayan@anejocateringco.com plus a Hub calendar; freebusy query on that address succeeded, but production event write permission/credentials remain unverified. Need actual integration connection plus call duration/working hours. Customer confirmations/reminders require rendered preview and activation. Current safe callback UI explicitly says not booked.

Need Dayan confirmation: catering pricing origin (actual Boca kitchen vs earlier daily-lunch mailing origin), proposed fee policy, call duration/hours. Never assume lunch free-delivery thresholds apply to catering. Previously sent email cannot be retroactively rewritten; no resend performed.

## Validation

Full local3,777tests passed,0failed; lint0errors/10existing warnings; Functions build passed. Final bounded callback/backend tests18passed after bilingual notice refinement. Isolated supported-browser preview changed rolls35→40, added1croqueta platter, showed total$300.36 and deposit$150.18, saved synthetic changes; no real provider/customer effects. Images visually inspected in rendered email. Evidence screenshots: ../evidence/customer-quote-self-service-2026-10-17/.

Release order: only migration0151, then reviewed exact-head CI, main deployment, supported live read-only acceptance. No customer-specific quote mutation/payment or unsolicited customer send during acceptance. Live release pending until recorded separately.


## Phase1 release and current evidence — October18,2026 UTC
PR211 merged34fb084ca120865c8d4871b2858a0edbadde3492. Production63558e8e-5650-441f-8a3e-974155a564aa succeeded. All four post-merge hosted checks passed. Final phase1 local3,779tests passed. Migration0151 applied before release. Supported browser verified real hosted quote with correct three catalog photos, editable quantities/headcount, live catalog additions including croquetas, and preferred-time form. Owner calendar showed zero requests. Original customer quote remains$248.75; no live edit/save/customer send/payment performed. Evidence live-quote-images.png and live-editor.png.

Joined isolated acceptance used actual handlers+localSQLite+mockSquare:35→40guests,rolls35→40,one30-croqueta platter;reviewed/saved29036cents and14518deposit. Originalcheckoutretired, replacementunpaid, callbacksavedrequestedwiththreequeued-disabledjobs. Fixtureprice is synthetic, not a production price claim. See joined-sandbox.json and real-handler-sandbox-saved.png.

## Calendar delivery follow-up — prepared, activation OFF
New0152 adds durable calendar/email jobs and disabled activation flags. Runtime checks approved hours/duration/OAuth, freebusy and reserved overlapping slots, deterministic eventIDs and matching GET readback. Uncertain results reconcile sameID. Confirmation/one-hour reminder templates require matching version approval and activation; accepted email is not delivery proof. Canceling a Hub request stops new customer messages but does not remove an existing Google event; UI says to review that event separately. No activation endpoint or credential change included.

Owner agenda shows saved evidence timestamps and separate provider acceptance labels. Missing scheduling inputs/OAuth remain blockers. Sample email preview uses fictional guest/date/15min for review only, not an approved scheduling default. Official API contracts checked against https://developers.google.com/workspace/calendar/api/v3/reference/events/insert and https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query .

Follow-up validation:3,802localtests pass/0fail/0skip;lint0errors/10existingwarnings;Functionsbuildsuccess. Logs /tmp/anejo-callback-release-{tests,lint,build}.log. Added malformed freebusy interval and changed-calendar email guards during parent review. Exact-head CI/deployment and migration0152 readback pending at this entry.


## Operating handoff
- Owner: Catering follow-up → Call calendar (/hub/owner/callbacks.html). Saving planning notes/duration does not activate anything. Confirmed labels require matching persisted Google readback; email accepted remains delivery-unverified.
- Customer: existing hosted quote → Modify my order → quantities/headcount/add dishes → Review changes → explicit save. Paid/special/unsupported quotes remain review/callback paths. No live customer save was used for acceptance.
- Activation requirements: Dayan-approved structured hours/duration, production Google OAuth and calendar write verification, rendered confirmation AND reminder approval, explicit activation timestamp/version. Historical pre-activation requests are not silently booked.
- Customer templates: callback-confirmation-preview.png and callback-reminder-preview.png are rendered fictional examples, not sent emails or booked appointments.
- Rollback: revert application release through reviewed Git path; leave additive0151/0152 tables/history intact. Disabling booking/messages halts new effects; do not delete durable uncertain-job receipts or reservations.
- Live acceptance caught an old agenda script in an existing browser session. PR213 versions only that script URL. Verification remains pending until the same live browser visibly displays the new readiness message.


## Evidence privacy correction
Repository visibility verified public during final review. The original live-quote-images.png screenshot included the customer name and quote ID (no email/phone/access token visible). Current file replaced with the non-identifying editor screenshot; it is no longer photo evidence. Exact photo mapping remains covered by synthetic email rendering and live read-only observation. Older Git history may retain the original screenshot. Dayan asked to authorize coordinated history cleanup; no claim of historical removal. Do not publish more customer-identifying screenshots.
