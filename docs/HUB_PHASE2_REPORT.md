# Añejo HUB — Phase 2 build report

_2026-06-10. Comms (in-app + Twilio two-way), vendor portal, owner workflow tools, lifecycle
events. Built on the Phase-1 stack (Pages Functions + D1 + KV, vanilla PWA, EN/ES)._

## Status

- **Deployed:** hub-preview (https://hub-preview.anejo-app.pages.dev). NOT yet pushed to git/production.
- **Migration `0006_comms_vendor.sql`** (threads.staff_id/ref_type/ref_id, additive) applied to **local + remote** D1.
- **Verification:** 86/86 functions pass node --check; all new inline page scripts parse; every flow smoke-tested live locally (thread create→reply→read, inbound Twilio webhook→thread, PO acknowledge→incomplete delivery→alert, expense approve, ticket resolve, route assign) and visually checked in-browser (comms list + chat bubbles, vendor portal). Preview verified: pages 200, APIs 401 anon, webhook answers TwiML.
- **Tracking:** 10 more plan events now firing (verified rows in activity_log): `thread.created`, `message.sent`, `message.received`, `vendor.po_acknowledged`, `vendor.delivery_confirmed`, `expense.reviewed`, `ticket.resolved`, `route.assigned`, `user.activated`, `eod_report.missed`; plus `user.invited` on staff creation. **41 of 46 plan events implemented.** Remaining 5: `user.invited` ✓(done) — outstanding: `ai_suggestion.actioned`, `automation.run` ✓, `agent_task.completed` ✓ … net outstanding = `ai_suggestion.actioned` + the Phase-3 automation types' own usage.

## What was built

### 💬 Comms core (`/hub/comms.html`, `functions/api/hub/comms/`, `functions/api/webhooks/twilio.js`)
- Threads + messages APIs, role-scoped: owner sees all + gets a recipient roster (staff+vendors+broadcast); staff/vendors see their own threads and can always message the owner; trainers/clients can initiate and the owner can reply.
- One-page messages UI: thread list with audience badges + previews, chat-bubble detail view, In-app/SMS channel toggle, 10s polling, full EN/ES.
- Outbound SMS/WhatsApp bridging via `_lib/twilio.js` (no-op + `sms_log` without creds).
- **Inbound Twilio webhook** `/api/webhooks/twilio`: signature-validated when `TWILIO_AUTH_TOKEN` is set, matches sender phone → staff/vendor → routes into their thread (creates one if needed), fires `message.received`, responds TwiML.
- Entry points: Messages buttons on kitchen home, driver quick actions, account page, owner comms.

### 📦 Vendor portal (`/hub/vendor/`, `functions/api/hub/vendor/pos.js`)
- Vendor signs in like any staff (PIN). Sees open POs with line items; **Acknowledge** → `vendor.po_acknowledged`; **Mark delivered** with "Everything arrived?" → `vendor.delivery_confirmed`; incomplete deliveries raise a deduped owner alert.
- Kitchen `restock/submit` now hands off automatically: creates/reuses the PO thread, posts an in-app summary, SMS-pings the vendor.

### 👑 Owner workflow tools
- **Expense review** (finance page): approve/reject with note → `expense.reviewed`, closes the matching alert, notifies the staffer in their thread.
- **Ticket resolution** (comms page): inline resolution note → `ticket.resolved` with resolution_minutes, closes the alert.
- **Route assignment** (deliveries page): pick date + driver + unassigned orders → creates route + ordered stops → `route.assigned`, SMS-pings the driver + thread message. Caps 50 stops; rejects already-routed orders.

### 👤 Lifecycle
- `user.invited` fires on staff creation (+welcome SMS with the server-generated PIN, never an owner-chosen one).
- `user.activated` fires on a staffer's first successful PIN login (with days_since_invite).
- `eod_report.missed` fires per missing staffer in the eod_chase automation.

## Owner actions (unchanged + new)
1. **Merge to git**: branch `kitchen-board-scope-filters` PR still pending; Phase 2 files are uncommitted in the working tree — same drift risk. Next git push to main without these = preview/prod divergence.
2. **Twilio**: set `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` (+ optional `TWILIO_WHATSAPP_FROM`) and point the number's inbound webhook at `POST https://anejocateringco.com/api/webhooks/twilio`. Until then comms is in-app only (SMS no-ops, logged).
3. Existing: `POSTHOG_*`, `CRON_KEY` + scheduler Worker, R2, STT.

## Known gaps (deliberate, candidates for Phase 3)
- No unread badges/read receipts (schema has no read marker yet).
- Broadcast threads are in-app only (no SMS fan-out).
- Owner compose roster covers staff+vendors; trainer/client compose is initiate-only from their side.
- Vendor per-line receiving quantities (`restock_items.received_qty`) not yet captured.
- Lead/team visibility scoping still owner-vs-self; leads have no team views yet.

## Phase 3 (per HUB_ROADMAP): advanced AI automations
`route_optimize`, `restock_suggest` (forecasting from order history), `ticket_triage`, `sentiment_scan`, `payroll_prep` — the "learns from daily ops" loop — plus `ai_suggestion.actioned` instrumentation (the human-accepts-AI metric), cron scheduling (needs CRON_KEY + a tiny Workers cron), unread badges, and lead/team views.
