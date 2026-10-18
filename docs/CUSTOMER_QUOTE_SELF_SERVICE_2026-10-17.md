# Customer quote self-service — October17,2026

Direct-session request: correct dish images in catering quotes, direct customer modifications, delivery-only clarity, preferred calls and calendar workflow. Branch codex/customer-quote-self-service based on production1e26ae4. Existing owner repair PR209 supplies safe Square retirement/replacement.

## Implemented

Shared live-catalog photo enrichment for future emails and hosted quotes. Exact mappings restore the actual three manually entered historical dish names without guessing similar dishes. Public image URLs verified200 image/webp. Missing images no longer leave empty thumbnail boxes. Original line amounts remain unchanged.

Token-authorized preview/apply flow: server-owned quoted rates for existing numeric quantities, current available fixed-price catering/traditional catalog additions, no caller money/identity authority. Review fingerprint and source version prevent stale/tampered acceptance. Old Square order checked/retired/confirmed canceled before deterministic replacement. Paid booking/payment races blocked. Unknown outcomes recover only frozen customer-approved revisions; owner revisions cannot be resumed by clients. Original email links redirect to completed replacement, and interrupted edits can resume. No auto-send or charge on saving. Quotes with custom fee/tax/discount lines or unsupported quantities require review, not guessed recalculation. Paid orders retain their agreed terms and can request a call.

Delivery-only wording and explicit delivery-fee-pending notice when not itemized. New fee proposal remains draft in CATERING_DELIVERY_PRICING_RESEARCH_2026-10-17.md; existing quote not repriced.

Preferred callback time requests: Eastern time with DST validation, quote-token scope, request idempotency and atomic request/outbox, deduplicated owner alert. Hub agenda at /hub/owner/callbacks.html linked from catering service desk. Status remains requested/awaiting confirmation. Calendar/confirmation/reminder outbox is disabled. No real Google appointment/customer message created.

## Remaining blocked work

Google Calendar runtime integration does not exist and cannot borrow Codex connector permissions. User selected dayan@anejocateringco.com plus a Hub calendar; freebusy query on that address succeeded, but production event write permission/credentials remain unverified. Need actual integration connection plus call duration/working hours. Customer confirmations/reminders require rendered preview and activation. Current safe callback UI explicitly says not booked.

Need Dayan confirmation: catering pricing origin (actual Boca kitchen vs earlier daily-lunch mailing origin), proposed fee policy, call duration/hours. Never assume lunch free-delivery thresholds apply to catering. Previously sent email cannot be retroactively rewritten; no resend performed.

## Validation

Full local3,777tests passed,0failed; lint0errors/10existing warnings; Functions build passed. Final bounded callback/backend tests18passed after bilingual notice refinement. Isolated supported-browser preview changed rolls35→40, added1croqueta platter, showed total$300.36 and deposit$150.18, saved synthetic changes; no real provider/customer effects. Images visually inspected in rendered email. Evidence screenshots: ../evidence/customer-quote-self-service-2026-10-17/.

Release order: only migration0151, then reviewed exact-head CI, main deployment, supported live read-only acceptance. No customer-specific quote mutation/payment or unsolicited customer send during acceptance. Live release pending until recorded separately.
