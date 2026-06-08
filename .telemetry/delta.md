# Delta: Current → Target — Añejo HUB

**Current state: greenfield.** The `anejo-app` codebase has no analytics SDK and no telemetry instrumentation. Therefore the delta is **ADD everything** (46 events). A formal audit (`product-tracking-audit-current-tracking`) would confirm zero existing events; this delta assumes that and should be re-validated if any tracking is later found.

- **ADD:** 46
- **RENAME:** 0
- **KEEP:** 0
- **REMOVE:** 0
- **CHANGE:** 0
- ADD + RENAME + KEEP = 46 = total target events ✓

## Add (not tracked today)

### Lifecycle / adoption (4)
| Event | Why |
|-------|-----|
| `user.invited` | Onboarding funnel start; measures rollout to staff/contacts |
| `user.activated` | First sign-in = adoption; the headline rollout metric |
| `user.signed_in` | DAU/WAU per role; the denominator for accountability rates |
| `app.installed` | PWA install = real field adoption (vs. one-off browser use) |

### Time & accountability (5)
| Event | Why |
|-------|-----|
| `shift.clocked_in` / `shift.clocked_out` | Core workforce signal; payroll, punctuality, hours |
| `shift.break_logged` | Labor compliance + accurate hours |
| `eod_report.submitted` | The accountability backbone — owner's #1 ask |
| `eod_report.missed` | Automation-fired accountability gap → owner alert |

### Delivery / driver (10)
`route.assigned`, `route.started`, `route.completed`, `delivery.completed`, `delivery.failed`, `delivery.checklist_completed`, `temp_log.recorded`, `mileage.submitted`, `expense.submitted`, `expense.reviewed` — full driver day, cold-chain compliance, reimbursements, and route efficiency (incl. AI-optimized flag).

### Tickets / issues (2)
`ticket.created`, `ticket.resolved` — complaint capture + resolution time, with AI-triage flag.

### Kitchen (8)
`order.received`, `order.prep_started`, `order.ready`, `order_summary.viewed`, `restock_order.submitted`, `reminder.acknowledged`, `checklist.completed`, `doc.viewed` — live order flow + prep times, restocking (with AI-suggested flag), procedure compliance, knowledge-base usage.

### Creative Studio (5)
`recipe_session.started`, `recipe_session.media_added`, `recipe_session.ai_assist_used`, `recipe.created`, `recipe.published` — the chef↔AI recipe-creation funnel and its conversion to published recipes.

### Communications (3)
`thread.created`, `message.sent`, `message.received` — one consolidated `message.sent` with a `channel` property (in_app/sms/whatsapp) instead of separate per-channel events (cost + clarity).

### Owner command center (4)
`dashboard.viewed`, `alert.triggered`, `alert.acknowledged`, `report.exported` — owner engagement + the alerting loop that keeps the hub the "at-a-glance" HUB.

### AI automation (3)
`automation.run`, `agent_task.completed`, `ai_suggestion.actioned` — proves the AI is doing work AND that humans accept it (the `decision` enum on `ai_suggestion.actioned` is the single best measure of AI value).

### Vendor (2)
`vendor.po_acknowledged`, `vendor.delivery_confirmed` — closes the restock loop.

## Design decisions worth noting
- **Consolidation:** messaging is one event (`message.sent` + `channel`) not three; checklists are one event (`checklist.completed` + `checklist_type`) not one-per-checklist. Fewer events, lower cost, same analysis power.
- **No page-view tracking.** Only `dashboard.viewed` / `order_summary.viewed` / `doc.viewed` as deliberate feature-engagement events.
- **AI value is first-class.** `actor_type=system` separates automation from human activity; `ai_suggestion.actioned.decision` quantifies whether the AI actually helps.
- **Accountability is measurable end-to-end:** `shift.*` + `eod_report.submitted` vs `eod_report.missed` → per-user `eod_compliance_rate_30d` trait → owner dashboard + alert.

## Next phase
Run **product-tracking-generate-implementation-guide** to turn this into a PostHog-on-Cloudflare-Functions instrumentation guide. The build workflow (Phase 1) will instrument lifecycle, time/accountability, delivery, kitchen, Creative Studio, owner, and AI-automation events as those surfaces are built.
