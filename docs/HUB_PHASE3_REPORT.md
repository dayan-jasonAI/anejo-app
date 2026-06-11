# Añejo HUB — Phase 3 build report

_2026-06-10. The AI layer: five advanced automations, the suggestion accept/dismiss loop,
cron scheduling (code ready, deploy gated), unread message badges. **46/46 tracking-plan
events now implemented — the original spec is fully closed.**_

## Status
- **Deployed:** hub-preview (https://hub-preview.anejo-app.pages.dev). Production deploy + git merge still pending owner action.
- **Migrations applied local + remote:** `0007_ai_ops.sql` (suggestions, thread_reads). Note: the parallel session's `0007_client_phone.sql` shares the number (both applied; consider renumbering later).
- **Verification:** 89/89 JS files pass checks + import-resolution audit; all five automations smoke-run with correct outputs; full suggestion loop exercised (route accepted → real route + `route.assigned ai_optimized:true`; restock accepted → draft PO w/ 8 items for the vendor; payroll dismissed); `ai_suggestion.actioned` fired **exactly once** per decision (a double-fire between client and server was caught and removed in integration); unread cycle verified (1 → open thread → 0 → new message → 1); AI Ops page + global unread dot visually verified in-browser.

## What was built

### 🤖 Five automations (functions/_lib/automations.js — all degrade deterministically without ANTHROPIC_API_KEY)
| Automation | What it does | Output |
|---|---|---|
| `route_optimize` | Groups the day's unassigned orders by window, picks the least-loaded driver, optionally AI-sequences stops | **Suggestion** → accept creates the route + SMS-pings the driver |
| `restock_suggest` | Aggregates 14 days of order items into demand, proposes PO quantities (AI-refined when key present) | **Suggestion** → accept creates a draft PO for the kitchen to submit |
| `ticket_triage` | Classifies open tickets' severity (AI or keyword heuristic; never downgrades), flags urgent ones | Direct action + critical alert |
| `sentiment_scan` | Screens 24h of messages/EODs/tickets for negativity (lexicon + optional AI) | `negative_sentiment` alerts, deduped |
| `payroll_prep` | Aggregates 14 days of closed shifts: hours, breaks, est. pay per staffer | **Suggestion** (review = accept) |

### ✅ Suggestion loop (`/api/hub/owner/suggestions`, suggestions table)
Pending suggestions carry a typed JSON payload; owner accepts (side effect executes first, then status flips) or dismisses. Every decision fires `ai_suggestion.actioned {suggestion_type, decision}` — **the metric that proves the AI earns its keep**. Race-safe: routes skip orders assigned elsewhere; fully-raced suggestions auto-expire (409).

### 🧭 AI Ops page (`/hub/owner/aiops`, tile on the command center)
Suggestions inbox with typed detail rendering + Accept/Dismiss · "Run now" buttons for all 7 automations · recent runs feed (outcome badge, duration, tokens). Full EN/ES.

### 🔔 Unread badges
`thread_reads` watermarks per reader; `threads` returns per-thread + total unread; new `GET /api/hub/comms/unread` powers a **global badge in hub.js**: any Messages link on any page shows a red count pill, the ☰ button gets a dot, refreshed every 60s.

### ⏰ Cron (code complete, deploy GATED — needs owner OK)
`cron/` contains a standalone `anejo-cron` Worker: 6 schedules (ET): eod_chase 21:15 + daily_summary 21:30 nightly, route_optimize 05:30, sentiment_scan+ticket_triage 14:00, restock_suggest Mon 06:00, payroll_prep 1st & 15th 08:00 — each POSTs `/api/hub/automations/run` with `X-Cron-Key`. Deploy: `cd cron && wrangler deploy && wrangler secret put CRON_KEY` + set the same `CRON_KEY` on the Pages project (see cron/README.md). Until deployed, automations run on demand from AI Ops.

## Owner actions outstanding
1. **Approve cron deploy** (one command sequence — makes the HUB fully self-running).
2. Merge git (kitchen-fixes PR + commit Phases 2–3 work) — drift risk remains until then.
3. Production deploy of Phases 2–3 (preview-verified).
4. Existing: Twilio creds + webhook, PostHog keys, R2, STT.

## The numbers
- **46/46 tracking-plan events implemented** (Phase 1: 31 → Phase 2: 41 → Phase 3: 46).
- 7 automations, 3 suggestion types, 6 roles, 2 languages, ~90 serverless functions.
