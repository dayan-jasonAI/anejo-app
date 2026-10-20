# Catering workspace: critical review and release record

Owner: Dayan. Scope: owner quotes, customer checkout, payment evidence and operational handoffs.
Direct-session authorization: October 20, 2026 request to critically review and optimize the Hub against Square. No customer send, refund, new subscription, tax determination or credential change authorized by this engineering release.

## Assessment

The Hub has real quote/payment/fulfillment capabilities, but it is not yet a complete substitute for Square's business-management workflow. The highest-friction failures were structural: editing a payable quote could be confused with creating another offer; no durable unfinished working copy; disconnected catalog entry; a quantity field that did not necessarily reprice a line; send approval not bound to the actual saved email; weak distinction between accepted messages and proven delivery.

This release addresses those foundations. It does not certify every wider operational workflow or claim increased conversion without paid-order evidence.

## What changed

- Separate Save draft from Create deposit checkout. Saving is internal only; partial work survives reload. Version conflicts preserve current edits rather than silently overwrite. Archive is non-destructive. A prepared draft links only to a matching persisted quote; recovery uses durable checkout identity, not a similar customer name.
- Catalog picker uses live D1 menu SKU prices, images, availability and pack sizes. Quantity multiplies the selected pack price. Historical agreed prices remain unchanged; owner can explicitly choose a custom total. Catalog mode rejects stale prices and insufficient recorded stock. This is not an ingredient reservation or production-capacity guarantee.
- Reopen an existing quote and review/send its actual stored email. Rendering must finish before approval; edits invalidate a preview; stale async results cannot authorize another payload. The server binds recipient, stored version and rendered content to the review hash.
- A durable send claim and reciprocal revision/retirement gates prevent competing checkout changes while a send is unresolved. The send uses exactly the reviewed document. Original email cannot be force-resent; reminders have their own reviewed follow-up workflow. Unknown outcomes require reconciliation, not blind retries.
- A completed deposit only books when its USD amount exactly matches the expected deposit and a provider payment ID exists. Mismatches create reconciliation evidence and alerts. Database failures request webhook retry. Paid-alert retry preserves receipt/booking state and avoids duplicate alerts.
- Balance reminders require an actual provider receipt to claim acceptance, distinguish suppression/unknown outcomes, and re-read balance/customer state after link preparation. Acceptance is not delivery.
- Personalization copy offers a separately confirmed service; it no longer asserts an unverified design team is already working.

## Complete journey: remaining gaps

| Stage | Existing / improved capability | Remaining limitation and exact next action |
|---|---|---|
| Inquiry | Structured intake, catalog suggestions, reviewed bilingual acknowledgement activation and lead-response tracking | Live activation/receipt evidence must be checked per lead. A lead label alone is not proof of customer service. Source: catering_lead_service.js. |
| Owner preparation | Catalog selection, explicit negotiated price, saved draft, original request prefill and safe unpaid revision | Full customer directory reuse, unified event address/time/presentation context, reusable packages and consolidated timeline remain fragmented. Add a single event workspace, avoiding guessed customer facts. |
| Quote delivery | Saved-email review, named recipient, opt-in SMS, durable send outcome | General inbound email replies are not automatically reconciled into Hub response status. Unknown sends deliberately remain fenced; expose provider reconciliation in the owner workspace rather than assume success. |
| Customer changes | Eligible unpaid quantities/catalog additions, server-owned prices and reviewed replacement | Confirmed nonzero delivery fee, discounts/taxes or paid deposits block automatic edits. A fee must never disappear to enable editing. Implement a reviewed fee-policy/amendment path; retain the current payable quote until its replacement is proven safe. Source: catering_customer_edit.js, catering_quote_revision.js. |
| Deposit / balance | Separate deposit/balance links, exact receipt verification, read-only provider status, reminders with acceptance evidence | Native Square invoices with deposit+balance schedules warrant sandbox comparison; do not replace established payable links or accidentally activate Square reminder emails. |
| Refund / cancellation | Unpaid checkout retirement preserves history; paid edits remain protected | Catering refund events are not reconciled into quote/fulfillment state; generic refund action targets ordinary orders. Build refund-status synchronization, partial/full distinction, owner-approved refund execution and fulfillment warning. No live refund incident was established by this audit. Source: api/webhooks/square.js, order-actions.js. |
| Calls | Hub callback requests and durable calendar/email jobs exist | Production calendar authorization, approved call duration/hours, current templates and activation are prerequisites. Request is not confirmed appointment. Source: catering_callback_delivery.js and CUSTOMER_QUOTE_SELF_SERVICE_2026-10-17.md. |
| Kitchen / delivery | Catering execution and driver assignment records exist | Catering notifications are explicitly disabled in execution/assignment modules. Review actual templates and joined dispatch/drop-off workflow before enabling. No driver/customer notification claim is justified yet. |
| Delivery / extras | Delivery-only wording and separate owner-approved fee | Automatic catering distance/size fee policy, setup/rental/server rates and post-deposit change terms need Dayan decisions. The previous one-event approved fee is not a general policy. |
| Reporting | Durable quotes, provider receipts, lead-response records | Unified conversion funnel, stage aging, time-to-first-response, deposit conversion and gross margin need reconciled event definitions; do not turn email acceptance into a sale. |

## Square: borrow useful patterns, respect API boundaries

Square's estimate UI connects customers, catalog items/modifiers, discounts, fees, packages and saved drafts before customer acceptance. This is the relevant usability benchmark: fewer duplicate entries, clear lifecycle, one customer/event record. Its estimates are not transactions and require eligible plans. [Square estimates](https://squareup.com/help/us/en/article/7215-create-an-estimate-online).

Square's API supports invoices and payment schedules; estimates, recurring invoices and branding/template setup are not equivalent API capabilities. Subscription entitlement and actual Añejo OAuth permissions remain unverified. Do not make a subscription purchase or activate a competing payment workflow as an implementation shortcut. [Invoices API](https://developer.squareup.com/docs/invoices-api/overview).

Use Square for financial records and payments; keep recipe, packaging and batch planning in the Hub because Square inventory does not track ingredients or product bundles. [Inventory API](https://developer.squareup.com/docs/inventory-api/what-it-does).

Keep delivery dispatch authoritative in the Hub unless Square partner access is verified. API-created DELIVERY fulfillment has restricted visibility; it is not automatically a working POS delivery integration. [Fulfillment restrictions](https://developer.squareup.com/docs/orders-api/fulfillments).

## Decisions needed from Dayan

1. General catering delivery pricing: approved origin, distance bands, order-size rules, minimums, setup/rental/server charges. Research is a proposal, not authorization to charge a made-up rate.
2. Callback duration and available days/hours for dayan@anejocateringco.com / Hub calendar. Credential entry, if needed, stays with the owner.
3. Post-deposit amendment/cancellation terms, including additional items, reductions, cutoff and refund handling; implementation must preserve the original financial agreement.
4. Approval of rendered customer/driver notification templates before activation. No retroactive messages by default.

## Validation and release

Local baseline: 3,934 tests passed, zero failures/skips. Scoped follow-up checks cover final wording/status refinements. Functions build passed. Lint: zero errors, ten pre-existing warnings. Independent desktop/mobile synthetic browser acceptance under production CSP covered catalog packs, negotiated rates, durable drafts, dirty-edit cancellation, one checkout identity, prepared linkage and saved-email review. No real charges/messages/refunds used for testing.

Release requires additive migrations 0155 and 0156 before code, exact-head hosted checks, merge/deployment evidence and live read-only owner acceptance. Deployment status is recorded separately after completion; local tests are not deployment proof.
