# Añejo HUB — Architecture

The **Añejo HUB** is the internal operations app for Añejo Catering Co. It is **not a new app**: it extends the existing `anejo-app` Cloudflare Pages project, reusing the same stack, auth, and database. This document is the map every HUB surface depends on.

## How the HUB extends anejo-app

| Concern | Existing anejo-app | HUB addition |
|---|---|---|
| Hosting | Cloudflare Pages + Functions | same — new handlers under `functions/api/hub/` |
| Frontend | vanilla HTML/CSS/JS in `public/` | new PWA surfaces under `public/hub/` |
| Database | D1 binding `env.DB` (migrations `0001`, `0002`) | new tables in `migrations/0003_hub.sql` |
| Sessions | KV binding `env.SESSIONS` (magic-link) | reused as-is; new `staff` user_type |
| Email | Resend via `functions/_lib/email.js` | reused for invites/alerts |
| Commerce | Square (orders/subscriptions) | surfaced read-only via the `orders` table |
| AI | Anthropic API | Creative Studio + automations |
| Comms (new) | — | Twilio SMS/WhatsApp via `_lib/twilio.js` |
| Analytics (new) | — | PostHog via `_lib/track.js` |

Nothing in the existing trainer/client product is modified. The HUB is additive.

## Data model

All HUB tables live in `migrations/0003_hub.sql`. Conventions match `0001_init.sql`: `TEXT PRIMARY KEY` ids (prefix + token/uuid), `INTEGER` unix-ms timestamps (`created_at`/`updated_at`), JSON stored as `TEXT`, and foreign keys to existing tables where the model calls for it.

```
                 ┌──────────────┐
   orders ◄──────┤ route_stops  │◄─── routes ◄─── staff (driver)
     ▲           └──────────────┘                   │
     │           deliveries ──────────────────┐     │
     │                                         ▼     ▼
   clients ◄── tickets        shifts ──── staff ─── eod_reports
   trainers ◄── threads ── messages ── sms_log
                                         ▲
                              twilio.js (inbound/outbound)

   checklists ─ checklist_runs ─ checklist_items     temp_logs
   restock_orders ─ restock_items   expenses  mileage  reminders
   docs ── recipes ── recipe_sessions ── recipe_session_events
   automations ── agent_runs        activity_log (owner feed)
```

Table groups:

- **Workforce:** `staff`, `shifts`.
- **Delivery:** `routes`, `route_stops`, `deliveries` (FK → `orders`).
- **Compliance:** `checklists`, `checklist_runs`, `checklist_items`, `temp_logs`.
- **Issues/finance:** `tickets`, `expenses`, `mileage`.
- **Restock:** `restock_orders`, `restock_items` (vendors are `staff` rows with `role='vendor'`).
- **Knowledge:** `reminders`, `docs`, `recipes`, `recipe_sessions`, `recipe_session_events`.
- **Comms:** `threads`, `messages`, `sms_log`.
- **Accountability:** `eod_reports`.
- **AI:** `automations`, `agent_runs`.
- **Feed:** `activity_log` — every meaningful action is mirrored here so the owner command center has a live feed even when PostHog is not configured.

## Auth & role model

The HUB reuses **magic-link + KV sessions** unchanged. Staff are a **new `user_type` (`staff`)** alongside the existing `trainer`/`client`. A staff session looks like:

```js
{ type: 'staff', uid: '<staff.id>', role: 'owner|kitchen|driver|vendor', team, email }
```

`functions/_lib/roles.js` is the single guard for HUB routes. It builds on `_lib/session.js` (`currentUser`) and normalizes any session — staff, trainer, or client — into a role context:

```js
import { requireRole, currentStaff } from '../../_lib/roles.js';

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner', 'kitchen']);
  if (ctx instanceof Response) return ctx;   // 401 / 403 already formed
  // ctx => { role, distinct_id, team, email, type }
};
```

Roles: `owner` (sees everything), `kitchen`, `driver`, `vendor` (staff), plus existing `trainer`, `client`. `requireStaff()` is a shortcut for any staff role. `currentStaff()` loads the full `staff` row for the session.

**Auth wiring (owner action / Phase 1):** the existing magic-link flow in `functions/api/auth/verify.js` is extended so a token with `user_type='staff'` provisions/links a `staff` row and sets a staff session, then redirects to `/hub/` (the router picks the role-specific surface). Invites are issued by the owner; that is an owner-built endpoint, not part of this foundation.

## Shared libraries (`functions/_lib/`)

All ESM, matching the existing modules.

- **`track.js`** — `capture(env, { event, distinct_id, role, actor_type='human', team, properties })`. Always writes a row to `activity_log` (the always-on owner feed), then POSTs to PostHog when `POSTHOG_KEY`/`POSTHOG_HOST` are present. No-ops safely (and never throws) when env vars are absent. `captureSystem()` tags `actor_type='system'`. Sets `$groups` (`business=biz_anejo`, `team=team_*`) per the tracking plan.
- **`twilio.js`** — `sendSms(env, {to, body, thread_id})` and `sendWhatsApp(...)` via the Twilio REST API. **Sandbox posture:** when `TWILIO_*` env vars are absent it no-ops the network call but still writes an `sms_log` row with `status='noop'`, so threads and UX work end-to-end without live credentials. `logInbound()` records inbound webhook messages. Never throws on the caller.
- **`roles.js`** — role resolution + `requireRole` / `requireStaff` / `currentStaff` guards (see above).
- **`hub.js`** — small helpers: `uuid()`, `today(tz)`, `parseJson()`/`toJson()` for JSON-in-TEXT columns, `bit()` boolean→int, re-exports `id`/`now` from `util.js`.

The client mirror lives in `public/hub/assets/hub.js` (`Hub.track(event, props)`), which POSTs to **`functions/api/hub/track.js`**. That endpoint resolves the actor from the session (identity is **never** trusted from the request body) and forwards through `_lib/track.js`.

## PWA approach

- **Shell** under `public/hub/`: `index.html` (role router), `manifest.webmanifest` (standalone, deep-green `#1b3a2b` + gold, brand icons), `sw.js`, `offline.html`, and shared `assets/hub.css` + `assets/hub.js`.
- **Service worker** (`sw.js`): app-shell cache-first for static assets, **network-first for `/api/*`** (always fresh ops data, soft-fail to a 503 JSON when offline), and a navigation fallback to `offline.html`.
- **Router** (`index.html`): calls `/api/me`, derives the role, and redirects to `/hub/owner`, `/hub/kitchen`, `/hub/driver`, or `/hub/vendor` (trainers/clients bounce to their existing dashboards). Shows the install prompt and is EN/ES aware via the existing `assets/js/i18n.js`.
- **Design tokens** (`hub.css`): deep green + gold brand, mobile-first, bottom-nav component (becomes a top tab bar on desktop ≥900px for the owner command center), cards, list rows, badges, forms, toasts.
- **Capabilities:** installable to home screen; camera/mic/GPS used by driver proof photos, temp-log photos, and Creative Studio voice — all via standard web APIs, no native wrapper.

## How website orders flow into kitchen/driver views

The **`orders` table is the bridge.** Square remains the payment source of truth; the public site writes order rows (see `functions/api/orders.js` / `webhooks/square.js`). The HUB consumes them:

1. A paid web order lands in `orders` (status `paid`).
2. The kitchen surface lists `orders` and emits `order.received` → `order.prep_started` → `order.ready` (status transitions on the existing row).
3. The owner/dispatch builds `routes` + `route_stops`, each stop referencing an `orders.id`.
4. The driver completes `deliveries` (FK → `orders`) with proof photo / signature; the order is marked `fulfilled`.

No order data is duplicated — the HUB layers `route_stops`/`deliveries` on top of the canonical `orders` row.

## AI-automation pattern

Automations are registered in `automations` (type, schedule, config, enabled) and every execution writes an `agent_runs` row (`actor_type='system'`, outcome, duration, tokens). The pattern:

- **Handlers:** `functions/api/hub/automations/*` — one file per automation type, callable on demand by the owner.
- **Scheduled:** a Cloudflare **scheduled** (cron) worker invokes the same handlers on a cadence (e.g. `eod_chase` after shift end, `daily_summary` nightly, `restock_suggest` weekly). Cron config lives in `wrangler.toml`; secrets stay in env.
- **Telemetry:** each run emits `automation.run` (with `outcome`) and `agent_task.completed`; human acceptance of AI output emits `ai_suggestion.actioned` with `decision` (accepted/edited/dismissed) — the single best measure of AI value.
- **Anthropic** powers the reasoning (route optimization, daily summaries, restock forecasting, ticket triage, sentiment scan, payroll prep). All AI work is `actor_type='system'` so it is separable from human activity in analysis and excluded from adoption metrics.
- **"Learns from daily ops" loop (Phase 3):** automations read recent `activity_log` / `agent_runs` / outcomes as context, so suggestions improve from observed history.

## Environment & secrets

Bindings: `DB` (D1), `SESSIONS` (KV). Env vars: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, Square vars, **`TWILIO_*`** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` / `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_WHATSAPP_FROM`), **`POSTHOG_KEY`** / **`POSTHOG_HOST`**. All optional libs no-op without their credentials (sandbox/test posture). **Secrets are never hardcoded; the kitchen street address never appears in any public-facing file (use "Palm Beach County").**
