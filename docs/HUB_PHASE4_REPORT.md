# Añejo HUB — Phase 4 build report

_2026-06-11. The "complete CRM" round: every item the owner selected (1, 2, 3, 4-drivers-only,
5, 6, 7, 9, 10, 11) built, verified, and deployed to production._

## Status
- **Deployed:** production (anejocateringco.com) + preview. Git synced (origin/main authoritative; merged through 3 concurrent pushes from the parallel session, consent gating verified intact post-merge).
- **Migration `0009_phase4.sql`** (shift_schedule, inventory_items, push_subscriptions) applied **local + remote**.
- **Verification:** 104/104 JS files pass node --check; every relative import resolves; all inline page scripts parse; every feature smoke-tested end-to-end locally (below); Customers + Schedule UIs browser-verified; preview + production URLs all 200 with APIs auth-gated; cron chain re-verified post-deploy.

## What was built (by item)

**1 · Customer CRM view** — `/hub/owner/customers` (new nav tab): unified list of clients + guest checkouts with search, subscription/SMS badges, order count · lifetime spend · recency; detail panel with profile, latest plan, full order history, Message deep-link into comms (`#t=<thread>`).
**9 · Manual order entry** — same page: phone/in-person orders with dynamic item lines, live totals (server-authoritative tax), Paid/Pending; lands on the kitchen board instantly (note + phone carried as a visible meta line, `order.received {manual:true}`).
**2 · Content management** — `/hub/owner/content`: docs library editor (manuals/policies/procedures/recipes — create, edit w/ versioning, role-scope, archive/restore only, never delete) + reminder composer (type/team/due/assignee; kitchen leads may also compose).
**6 · Real CSV report exports** — the Finance export button now downloads real files: payroll, deliveries, finance, accountability, temp-compliance (date-ranged, CSV-escaped, proper Content-Disposition).
**4 · Driver shift scheduling (drivers ONLY — cooks exempt per owner)** — `/hub/owner/schedule`: week grid (driver × day) with tap-to-add, shift chips, cancel (soft); SMS + in-app thread notify on assign/cancel; drivers see "Upcoming shifts" on their home; clock-in now derives real `minutes_late` from the schedule, feeding the existing late alert.
**10 · Team-lead views** — `/hub/team`: leads (is_lead) see their own team only — members + on-shift, EOD compliance w/ missing names, open tickets, temp excursions, reminders due. Owner sees any team. Lead/Team link on the account page.
**11 · Inventory / par levels** — `/hub/kitchen/inventory`: stock-count UI (below-par highlighted first), add/edit/archive items with vendor tagging; counts below par raise deduped `low_stock` alerts; **restock_suggest automation now proposes from real par gaps** (falls back to the 14-day order heuristic when inventory is empty).
**5 · Web push notifications** — tickle pattern (empty push → SW fetches `/api/hub/push/peek` → notification): VAPID ES256 signed in WebCrypto, subscribe/unsubscribe endpoints, SW push + notification-click handlers, "Enable notifications" toggle on the account page. Alerts tickle the owner's devices; new messages tickle the recipient. VAPID secrets already set on production.
**3 · R2 media storage** — `_lib/media.js` + gated `/api/hub/media/*` serving; driver proof photos/signatures and Creative Studio media store to R2 **when the binding exists** (graceful inline fallback today). ⏸️ **One owner click pending** (below).
**7 · Voice transcription** — `/api/hub/kitchen/studio/transcribe` (Workers AI Whisper): the chef's voice note is transcribed, rendered in the Studio chat, and sent to the AI sous-chef for a reply. `[ai]` binding added to wrangler.toml (deploys verified). Degrades to "transcription pending" without the binding/model access.

## ⏸️ The ONE owner action pending
**Enable R2** (API can't do it): Cloudflare Dashboard → **R2** → accept terms (error 10042 otherwise). Then either tell me or run:
```
wrangler r2 bucket create anejo-media
```
and uncomment the staged `[[r2_buckets]]` block in wrangler.toml + redeploy. Media starts persisting to R2 immediately; everything works (inline) meanwhile.

## New tracking events introduced
`customer.viewed`, `reminder.created`, `shift.scheduled`, `shift.schedule_canceled`, `inventory.counted`, `inventory.updated`, `push.subscribed`, `push.unsubscribed` — extensions beyond the original 46-event plan; consider adding to `.telemetry/tracking-plan.yaml` at the next revision.

## Notable follow-ups (deliberate)
- Whisper on prod needs first-use validation once a real voice note is recorded (binding deploys fine; model invocation verified only as graceful-fail locally).
- iOS web push requires the PWA installed to home screen (Apple platform rule).
- Sofia Lead's local demo PIN was reset to 445566 (must-change on first login).
- Confirm-dialogs in schedule/inventory are native `confirm()` — not i18n-translated (listed in dictionary for later).
- Items NOT in scope this round (per owner): vendor per-line received quantities (#8), payroll-provider export (#12 — the payroll CSV covers the basics).
