# Product Model — Añejo HUB (internal operations app)

## What it is
**Añejo HUB** is the owner-centric internal operations app for Añejo Catering Co. — a CRM + workforce + kitchen + delivery + comms command center. It is **not a new app**: it extends the existing `anejo-app` Cloudflare Pages project (Pages + Functions + D1 `DB` + KV `SESSIONS` + Resend + Square + Anthropic API), reusing the same magic-link/KV auth. Delivered as an **installable PWA** (home-screen install, camera, microphone, GPS, push, offline-tolerant). Desktop layout for the owner command center; mobile-first for staff on the floor/road.

Product category: **B2B operations / workforce + collaboration tool** (internal, single-tenant). Baseline = b2b-saas-core, with collaboration-tools + ai-ml-tools patterns layered in (Creative Studio is an AI generation surface).

## Primary value action
**A staff member completes their accountable daily duties through the app** — clock in/out, run the assigned route or kitchen queue, complete checklists/temp logs, and submit an end-of-day report — while the **owner sees all of it at a glance** in real time. Secondary headline action: **a chef finalizes a new recipe in Creative Studio** with the AI agent.

## Roles (the `user.role` enum)
- `owner` — sees everything; command center; accountability; alerts; finance roll-ups.
- `kitchen` — live orders, daily summaries, restock orders, clock in/out, reminders + procedure checklists, full docs/recipes/policies library, Creative Studio.
- `driver` — routes, delivery checklists, temperature logs, clock in/out, complaint tickets, mileage/expense submission.
- `trainer` — existing trainer-SaaS role (roster, plans, earnings) + comms.
- `client` — existing client role (plan view, meal/weight logs) + comms.
- `vendor` — restock/PO fulfillment + comms.
Cross-cutting: **everyone submits an end-of-day report** (accountability). **AI agents/automations** run throughout and are themselves an actor (`actor_type = human | system`).

## Entity / data model
Existing D1 (reused): `trainers, clients, plans, subscriptions, rev_share_events, meal_logs, weight_logs, leads, auth_tokens, orders`.

New HUB tables (target — implemented by the build workflow):
- `staff` (id, user_type=staff, role, name, email, phone, employment_type, pay_rate_cents, active)
- `shifts` (clock in/out, breaks, geo, total_minutes) — time & accountability
- `routes` + `route_stops` (driver routes; stop = an order/delivery)
- `deliveries` (status, proof photo, signature, completed_at, geo) — linked to `orders`
- `checklists` + `checklist_runs` + `checklist_items` (delivery, kitchen procedure, opening/closing)
- `temp_logs` (item, temp_f, threshold_min/max, in_range, photo)
- `tickets` (complaints/issues; type, severity, status, assignee)
- `expenses` + `mileage` (driver submissions; amount, miles, receipt photo, status)
- `restock_orders` + `restock_items` (kitchen → vendor purchase orders / POs)
- `reminders` (scheduled kitchen/staff nudges; acknowledged)
- `docs` (manuals, policies, procedures, recipes library; versioned; role-scoped)
- `recipes` + `recipe_sessions` + `recipe_session_events` (Creative Studio: voice + photo + AI agent transcript until finalized)
- `threads` + `messages` (in-app comms across all roles) + `sms_log` (Twilio inbound/outbound bridge)
- `eod_reports` (end-of-day report per person per day; structured + free text)
- `automations` + `agent_runs` (AI automation registry + execution log; learns from daily ops)
- `activity_log` (owner command-center feed; every meaningful action lands here)

## Group hierarchy
Single business, so groups are light. Top-level group = **business** (`anejo`, single). One sub-level: **team** (`kitchen | delivery | training | front_office | vendors`). Most events attribute to `team`; finance/owner events attribute to `business`. User-level tracking is primary.

## Integration / destinations
- **Analytics destination:** PostHog (group analytics + self-host-friendly + feeds the owner command center). snake_case `object.action` convention (greenfield → no migration cost).
- **Comms:** Twilio SMS/WhatsApp (hybrid with in-app threads).
- **Commerce (existing):** Square (orders/subscriptions = payment source of truth); the HUB surfaces order events but does not own payments.
- **AI:** Anthropic API (Creative Studio agent, automations, summaries).

## Current tracking state
**Greenfield.** No analytics instrumentation exists today. Target plan only; delta = "add everything." A code audit (`product-tracking-audit-current-tracking`) would confirm, but the app has no analytics SDK wired in.

## PII policy
`traits_only` — email/name/phone live in identify() traits marked `pii: true`, never in event properties. Customer/client contact data stays out of event payloads.

## Internal-actor policy
This app is entirely internal/staff + invited external contacts, so the usual "exclude internal users" rule is inverted: **track all human staff**, but tag **system/automation actions** with `actor_type = system` so AI-automation activity can be separated from human activity in analysis (and excluded from adoption metrics).
