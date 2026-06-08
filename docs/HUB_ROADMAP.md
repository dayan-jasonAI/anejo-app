# Añejo HUB — Roadmap

Phased delivery plan. Each phase lists the screens, the API endpoints, and which of the 46 tracking-plan events (`.telemetry/tracking-plan.yaml`) it covers. All 46 events are accounted for across the three phases.

Conventions: PWA surfaces under `public/hub/`, API handlers under `functions/api/hub/`. Every surface instruments through `_lib/track.js` (server) / `Hub.track()` (client).

---

## Phase 1 — Foundation + core surfaces (THIS build)

Goal: the owner sees the whole operation at a glance; staff run their accountable day; chefs create recipes with AI.

### Foundation (shipped by this build)
- **Docs:** `docs/HUB_ARCHITECTURE.md`, `docs/HUB_ROADMAP.md`.
- **Schema:** `migrations/0003_hub.sql` (all 26 HUB tables).
- **Libs:** `functions/_lib/track.js`, `twilio.js`, `roles.js`, `hub.js`.
- **PWA shell:** `public/hub/{index.html,manifest.webmanifest,sw.js,offline.html}`, `public/hub/assets/{hub.css,hub.js}`.
- **Endpoint:** `POST /api/hub/track`.

### Screens
| Surface | Path | Notes |
|---|---|---|
| Role router | `/hub/` | detects role from `/api/me`, redirects |
| Owner command center | `/hub/owner` | overview, deliveries, kitchen, staff, finance, comms tabs; live `activity_log` feed; alerts |
| Driver core | `/hub/driver` | route + stops, delivery proof, temp logs, checklists, clock in/out, tickets, mileage/expense |
| Kitchen | `/hub/kitchen` | live orders, daily summary, restock POs, reminders, checklists, docs/recipes library, clock in/out |
| Creative Studio | `/hub/kitchen/studio` | voice + photo + AI agent recipe session |
| End-of-day report | `/hub/eod` | shared accountability report (all roles) |

### Endpoints (representative)
- Auth/staff: extend `GET /api/auth/verify` for `user_type='staff'`; `GET /api/me` returns role/staff.
- Time: `POST /api/hub/shift/clock-in`, `POST /api/hub/shift/clock-out`, `POST /api/hub/shift/break`.
- EOD: `POST /api/hub/eod`.
- Driver: `GET /api/hub/driver/route`, `POST /api/hub/driver/route/start`, `POST /api/hub/driver/route/complete`, `POST /api/hub/driver/delivery`, `POST /api/hub/driver/temp-log`, `POST /api/hub/driver/checklist`, `POST /api/hub/driver/mileage`, `POST /api/hub/driver/expense`, `POST /api/hub/ticket`.
- Kitchen: `GET /api/hub/kitchen/orders`, `POST /api/hub/kitchen/order-status`, `GET /api/hub/kitchen/summary`, `POST /api/hub/kitchen/restock`, `POST /api/hub/kitchen/checklist`, `POST /api/hub/kitchen/reminder-ack`, `GET /api/hub/docs`.
- Creative Studio: `POST /api/hub/studio/session`, `POST /api/hub/studio/media`, `POST /api/hub/studio/assist`, `POST /api/hub/studio/recipe`, `POST /api/hub/studio/publish`.
- Owner: `GET /api/hub/owner/feed`, `GET /api/hub/owner/alerts`, `POST /api/hub/owner/alert-ack`, `POST /api/hub/owner/expense-review`, `GET /api/hub/owner/export`.
- Daily-summary automation: `POST /api/hub/automations/daily-summary` (+ scheduled).

### Tracking events covered (40 of 46)
- Lifecycle (4): `user.invited`, `user.activated`, `user.signed_in`, `app.installed`
- Time & accountability (5): `shift.clocked_in`, `shift.clocked_out`, `shift.break_logged`, `eod_report.submitted`, `eod_report.missed`
- Delivery (10): `route.assigned`, `route.started`, `route.completed`, `delivery.completed`, `delivery.failed`, `delivery.checklist_completed`, `temp_log.recorded`, `mileage.submitted`, `expense.submitted`, `expense.reviewed`
- Tickets (2): `ticket.created`, `ticket.resolved`
- Kitchen (8): `order.received`, `order.prep_started`, `order.ready`, `order_summary.viewed`, `restock_order.submitted`, `reminder.acknowledged`, `checklist.completed`, `doc.viewed`
- Creative Studio (5): `recipe_session.started`, `recipe_session.media_added`, `recipe_session.ai_assist_used`, `recipe.created`, `recipe.published`
- Owner (4): `dashboard.viewed`, `alert.triggered`, `alert.acknowledged`, `report.exported`
- AI (2 of 3): `automation.run`, `agent_task.completed` (daily-summary only)

---

## Phase 2 — Comms surfaces, trainers/clients, vendor portal

Goal: close the communication loop across every role and bring trainers/clients and vendors into the HUB.

### Screens
| Surface | Path | Notes |
|---|---|---|
| Comms inbox | `/hub/comms` | in-app threads; two-way Twilio SMS/WhatsApp bridge |
| Thread view | `/hub/comms/:thread` | message timeline, channel selector, AI-draft assist |
| Trainer comms | `/hub/trainer` | trainer roster + client messaging (atop existing trainer dashboard) |
| Client comms | `/hub/client` | client ↔ ops messaging (atop existing client dashboard) |
| Vendor portal | `/hub/vendor` | restock PO acknowledge + delivery confirmation |
| Owner finance roll-ups | `/hub/owner` (finance tab, expanded) | payroll prep inputs, reimbursements ledger |

### Endpoints
- Comms: `GET /api/hub/threads`, `POST /api/hub/threads`, `GET /api/hub/threads/:id`, `POST /api/hub/messages`, `POST /api/webhooks/twilio` (inbound SMS/WhatsApp → `_lib/twilio.js logInbound` → `message.received`).
- Vendor: `GET /api/hub/vendor/orders`, `POST /api/hub/vendor/acknowledge`, `POST /api/hub/vendor/confirm-delivery`.
- AI-draft: `POST /api/hub/messages/draft` (Anthropic-assisted reply).

### Tracking events covered (5 of 46)
- Communications (3): `thread.created`, `message.sent` (channel: in_app/sms/whatsapp), `message.received`
- Vendor (2): `vendor.po_acknowledged`, `vendor.delivery_confirmed`

Running total after Phase 2: 45 of 46.

---

## Phase 3 — Advanced AI automations ("learns from daily ops")

Goal: the HUB actively runs the business — optimizing routes, forecasting restock, scanning sentiment, prepping payroll, chasing accountability — and improves from observed history.

### Screens
| Surface | Path | Notes |
|---|---|---|
| Automation registry | `/hub/owner/automations` | enable/disable, schedules, last outcome |
| Agent run log | `/hub/owner/automations/runs` | `agent_runs` history, tokens, outcomes |
| Suggestions review | inline across surfaces | accept/edit/dismiss AI suggestions |

### Automations (each → `automations` row, `agent_runs` per execution, `actor_type='system'`)
- `route_optimize` — order stops into an efficient route (`route.assigned` with `ai_optimized=true`).
- `restock_suggest` — forecast restock from order history (`restock_order.submitted` with `ai_suggested=true`).
- `eod_chase` — detect shift end with no EOD report → `eod_report.missed` + owner alert.
- `ticket_triage` — classify/severity-rank incoming tickets (`ticket.created` with `ai_triaged=true`).
- `sentiment_scan` — scan messages/tickets for negative sentiment → `alert.triggered` (`negative_sentiment`).
- `payroll_prep` — roll up shifts/mileage/expenses into a payroll draft (`report.exported`, `payroll`).
- `daily_summary` — (started in Phase 1) nightly owner brief.

### Endpoints
- `POST /api/hub/automations/route-optimize`, `.../restock-suggest`, `.../eod-chase`, `.../ticket-triage`, `.../sentiment-scan`, `.../payroll-prep` — each callable on demand and from the **scheduled** (cron) worker.
- Cron config in `wrangler.toml` invoking the scheduled handler.

### Tracking events covered (1 of 46, plus heavy reuse)
- AI (1 net new): `ai_suggestion.actioned` (decision: accepted/edited/dismissed) — the AI-value metric, wired across every suggestion surface.
- Reuse: `automation.run`, `agent_task.completed`, `alert.triggered`/`alert.acknowledged`, `route.assigned`, `restock_order.submitted`, `eod_report.missed`, `ticket.created` (now AI-flagged).

Running total after Phase 3: **46 of 46** events instrumented.

---

## Coverage summary

| Phase | Net-new events | Cumulative |
|---|---|---|
| Phase 1 | 40 | 40 |
| Phase 2 | 5 | 45 |
| Phase 3 | 1 | 46 |

All 46 events in `.telemetry/tracking-plan.yaml` are mapped to a screen/endpoint and a delivery phase.
