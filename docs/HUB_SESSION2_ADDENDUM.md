# Añejo HUB — Session 2 addendum (auth, alerts, automations)

_Builds on HUB_BUILD_REPORT.md. All local, sandbox posture, uncommitted/undeployed._

## Real staff sign-in (PIN) + RBAC
- **Unified login** at `/login`: enter phone or email → staff get a PIN prompt; trainers/clients get an emailed magic link. Same page, auto-detected.
- **PIN credentials** hashed with PBKDF2-SHA256 (`_lib/pin.js`); never stored plaintext. Per-account **lockout** (5 fails → 15 min) + per-IP rate limiting.
- **Owner-issued onboarding**: owner adds staff in **Owner → Staff**; initial PIN shown once; staff **must set their own PIN** on first login (`must_change_pin`).
- **Manager/Lead tier**: `staff.is_lead`. Helpers `visibilityScope()` / `canSeeStaff()` in `_lib/roles.js` (owner=all, lead=team, staff=self). Plumbed through sessions + `/api/me`; **enforcement across every list endpoint is still a TODO**.
- **Account page** `/hub/account.html`: change PIN + sign out. A universal Account button (☰, top-right) auto-mounts on every HUB page via `hub.js`.
- Migration `0005_staff_auth.sql` (ALTERs to `staff`). `/api/me` now **whitelists** fields (closed a pin_hash leak).

### Endpoints added
```
POST /api/auth/identify        # step 1: pin | magic_link
POST /api/auth/pin-login       # verify PIN + lockout → staff session (+ user.signed_in)
POST /api/staff/set-pin        # staff changes own PIN
GET/POST /api/hub/owner/staff  # owner: roster + create/update/reset_pin
GET  /api/dev/login?role=…     # localhost-only reusable demo login (404s in prod)
```

## Owner alerts now fire from real events
`raiseAlert()` wired into the surfaces (deduped, mirrored to `activity_log` + PostHog):
| Event | Alert | Severity |
|---|---|---|
| Failed delivery | `delivery_failed` | warning |
| Temp out of safe band | `temp_excursion` | critical |
| Expense submitted | `expense_pending` | info |
| Late clock-in (≥10m) | `late_clock_in` | warning |
| Urgent/high/safety ticket | `negative_sentiment` | warning/critical |
| EOD missing / low compliance | `eod_missing` | warning/info (via automation) |

`low_stock` remains automation/seed-driven (no par-level model yet).

## AI automation engine
- `_lib/automations.js` + `POST /api/hub/automations/run` (owner session **or** `X-Cron-Key` header).
- Implemented: **`daily_summary`** (snapshot + optional Anthropic narrative, guarded; falls back to deterministic) and **`eod_chase`** (raises `eod_missing` for staff with no EOD).
- Every run logs an `agent_runs` row and fires `automation.run` + `agent_task.completed`. `GET` returns recent runs.
- Planned (not built): `restock_suggest`, `route_optimize`, `ticket_triage`, `sentiment_scan`, `payroll_prep`.
- **Scheduling needs an owner action**: Pages Functions have no native cron. A tiny Workers cron (or any scheduler) should `POST /api/hub/automations/run` daily with `X-Cron-Key`. Set `CRON_KEY` as a secret.

## Verified (local)
76/76 functions `node --check`; all 5 migrations apply in sequence; login + lockout + forced-reset + change-PIN + role 403s + alert producers + both automations all tested live against `wrangler pages dev`.

## Still needs owner input / permission (not done autonomously)
- Commit + push (auto-deploys) — not done; awaiting go-ahead.
- Apply migrations `0003/0004/0005` to **remote** D1.
- Secrets: `POSTHOG_KEY/HOST`, `TWILIO_*`, `CRON_KEY`, R2 bucket, STT provider.
- Deploy the cron trigger (Workers) for automations.
- Design calls for Phase 2 surfaces: vendor portal, two-way comms threads, and enforcing lead/team scoping in the UIs.
