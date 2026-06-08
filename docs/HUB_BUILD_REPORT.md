# Añejo HUB — Phase-1 Build Report

_Generated: 2026-06-07. Internal operations PWA built inside the existing Cloudflare
Pages + Functions repo. Stack: D1 (`env.DB`), KV sessions (`env.SESSIONS`),
magic-link auth, vanilla HTML/CSS/JS, bilingual EN/ES._

## Status summary

- **Surfaces built:** Owner command center, Driver app, Kitchen app + shared HUB shell (PWA, SW, install prompt, role router).
- **`node --check`:** 47/47 function `.js` files (newer than `migrations/0002_orders.sql`) pass. All `public/hub/*.js` pass.
- **Migrations:** `migrations/0003_hub.sql` and `migrations/0004_owner_alerts.sql` both parse cleanly in `sqlite3 :memory:`. **Not yet applied to remote D1.**
- **Sandbox posture verified:** `_lib/track.js` (PostHog) and `_lib/twilio.js` (SMS/WhatsApp) both no-op safely with no credentials and never throw on callers (runtime-tested).
- **Tracking:** 31 of the 46 planned events are instrumented in code; 15 pending (see below — all belong to surfaces deferred past Phase-1).

## What was built (by surface)

### Shared HUB shell (`public/hub/`)
- PWA manifest, service worker, offline page, install prompt.
- `assets/hub.js` — shared client runtime: session check (`/api/me`), role router (`routeForRole`/`routeByRole`), per-surface `guard()`, `track()` beacon wrapper, toast/api helpers.
- `index.html` routes owner→`/hub/owner`, driver→`/hub/driver`, kitchen→`/hub/kitchen`; unknown role and anon states handled.
- Staff entry point added to `public/portal.html` ("open the Añejo HUB →"). Marketing pages and address rules untouched.

### Owner (`public/hub/owner/`, `functions/api/hub/owner/`)
Command center: overview, live activity feed, staff status, EOD compliance, alerts, today's deliveries, finance rollup, exportable report. All endpoints `requireRole(['owner'])`. Owner read-dashboards are GET-only; viewing telemetry fires from the client (`dashboard.viewed`).

### Driver (`public/hub/driver/`, `functions/api/hub/driver/`)
Clock in/out, route, delivery complete/fail, checklist, temp log, mileage, expense, ticket create, EOD. Guarded `['driver','owner']`.

### Kitchen (`public/hub/kitchen/`, `functions/api/hub/kitchen/`)
Clock in/out, orders board, summary, restock create + submit (AI-suggested PO via Anthropic, graceful demo fallback), reminders, checklist, doc library, Creative Studio (session/message/media + recipe create/publish), EOD. Guarded `['kitchen','owner']`.

## Endpoint list

```
POST /api/hub/track

# Owner
GET  /api/hub/owner/overview
GET  /api/hub/owner/activity
GET  /api/hub/owner/staff-status
GET  /api/hub/owner/eod-compliance
GET  /api/hub/owner/alerts
GET  /api/hub/owner/deliveries/today
GET  /api/hub/owner/finance/rollup
GET  /api/hub/owner/report

# Driver
POST /api/hub/driver/clock-in
POST /api/hub/driver/clock-out
GET  /api/hub/driver/route
POST /api/hub/driver/delivery/complete
POST /api/hub/driver/delivery/fail
POST /api/hub/driver/checklist/submit
POST /api/hub/driver/temp/log
POST /api/hub/driver/mileage/submit
POST /api/hub/driver/expense/submit
POST /api/hub/driver/ticket/create
POST /api/hub/driver/eod/submit

# Kitchen
POST /api/hub/kitchen/clock-in
POST /api/hub/kitchen/clock-out
GET  /api/hub/kitchen/orders
GET  /api/hub/kitchen/summary
GET/POST /api/hub/kitchen/restock/create
POST /api/hub/kitchen/restock/submit
GET  /api/hub/kitchen/reminders
POST /api/hub/kitchen/checklist/submit
GET  /api/hub/kitchen/docs/list
GET  /api/hub/kitchen/docs/get
POST /api/hub/kitchen/studio/session
POST /api/hub/kitchen/studio/message
POST /api/hub/kitchen/studio/media
POST /api/hub/kitchen/recipe/create
POST /api/hub/kitchen/recipe/publish
POST /api/hub/kitchen/eod/submit
```

## Tracking plan coverage (46 events)

### Instrumented (31)
`alert.acknowledged`, `alert.triggered`, `app.installed`, `checklist.completed`,
`dashboard.viewed`, `delivery.checklist_completed`, `delivery.completed`,
`delivery.failed`, `doc.viewed`, `eod_report.submitted`, `expense.submitted`,
`mileage.submitted`, `order.prep_started`, `order.ready`, `order.received`,
`order_summary.viewed`, `recipe.created`, `recipe.published`,
`recipe_session.ai_assist_used`, `recipe_session.media_added`,
`recipe_session.started`, `reminder.acknowledged`, `report.exported`,
`restock_order.submitted`, `route.completed`, `route.started`,
`shift.break_logged`, `shift.clocked_in`, `shift.clocked_out`,
`temp_log.recorded`, `ticket.created`

### Pending (15) — all deferred surfaces, no Phase-1 gap
- **Vendor portal (not built):** `vendor.po_acknowledged`, `vendor.delivery_confirmed`
- **Comms / messaging (read-only in Phase-1, no outbound endpoint yet):** `message.sent`, `message.received`, `thread.created`
- **Automations / cron (not built):** `automation.run`, `agent_task.completed`, `ai_suggestion.actioned`, `eod_report.missed`
- **User lifecycle (handled by existing magic-link auth, not yet wired into HUB telemetry):** `user.invited`, `user.activated`, `user.signed_in`
- **Owner workflows not yet built:** `expense.reviewed`, `ticket.resolved`, `route.assigned`

These map to surfaces explicitly scoped past Phase-1 (vendor app, automation/cron jobs, owner comms outbound). No instrumentation is missing from a surface that was built.

## OWNER ACTION REQUIRED

1. **Apply migrations to D1 (local + remote)** — required before the HUB works:
   ```
   npx wrangler d1 migrations apply DB --local
   npx wrangler d1 migrations apply DB --remote
   ```
   (or run the two SQL files directly). Do not skip `0004_owner_alerts.sql`.
2. **Seed staff rows** — insert `staff` rows (`role` in owner/kitchen/driver, `email`, `team`) so magic-link sign-in resolves a HUB role. Without a staff row, a signed-in user lands on the "no role yet" screen.
3. **PostHog (optional, recommended)** — set `POSTHOG_KEY` and `POSTHOG_HOST` as secrets to forward events. Without them, events still land in the `activity_log` table (the owner feed works regardless).
4. **Twilio (optional)** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a sender (`TWILIO_FROM` / `TWILIO_MESSAGING_SERVICE_SID` / `TWILIO_WHATSAPP_FROM`) to enable real SMS/WhatsApp. Until set, sends are logged to `sms_log` with `status='noop'` — threads and UX work end-to-end without sending.
5. **R2 (optional, future)** — Creative Studio media currently records metadata only. Wire an R2 bucket for actual photo/video storage.
6. **STT provider (optional, future)** — Creative Studio voice capture needs a speech-to-text provider before voice notes transcribe.
7. **Never hardcode the above secrets** — set via `wrangler secret put` / dashboard. Kitchen street address must stay "Palm Beach County" in any public-facing file.

## Verification commands (reproducible)
```
# node --check every new function file
find functions -name '*.js' -newer migrations/0002_orders.sql -print0 | xargs -0 -n1 node --check
# migration parse
sqlite3 :memory: < migrations/0003_hub.sql
sqlite3 :memory: < migrations/0004_owner_alerts.sql
```
