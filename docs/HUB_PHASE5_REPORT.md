# Añejo HUB — Phase 5 Report (Resilience & Polish)

Date: 2026-06-11
Deploy: production (anejocateringco.com) + anejo-cron worker
Status: **Shipped & verified.** One owner action remains (run the first backup — see §7).

## 1. What shipped

Phase 5 closes the resilience gaps in the HUB build:

| # | Item | Keystone? |
|---|------|-----------|
| A | **D1 → R2 database backups** (the keystone — production had *no* backup) | ★ |
| B | Comms thread **close / archive** (open/closed inbox filter, owner-only) | |
| C | **Recurring reminders** (daily/weekly templates) + materializer tick | |
| D | **Doc image upload** (recipes/manuals attach a photo, shown in kitchen library) | |
| E | **Guest → client conversion** (onboard an order-only customer under the house trainer) | |
| F | Integrator polish: kitchen-board O(N)→single-query, staff session inactivity timeout, real PWA icons, cron wiring, tracking-plan sync, ES strings | |

## 2. New / changed endpoints

- `POST /api/hub/admin/backup` — full D1→R2 backup + 30-day rotation. Auth: owner session **or** `X-Cron-Key`. R2 absent → `{ok:false, reason:'R2 not enabled'}` at HTTP 200 (no data loss, no 5xx). Writes an `agent_runs` row + fires `automation.run {automation_type:'d1_backup'}`.
- `GET  /api/hub/admin/backup` — owner only; newest 20 backups + `r2_enabled`.
- `POST /api/hub/admin/reminders-tick` — materializes due recurring-reminder instances from templates. Auth owner **or** `X-Cron-Key`. Idempotent (one spawn per template per NY day via `last_materialized_date`).
- `POST /api/hub/comms/thread-status {thread_id, action:'close'|'reopen'}` — owner-only; soft flag only, never deletes.
- `GET  /api/hub/comms/threads?status=open|closed|all` — default `open` so closed threads drop out of the inbox; items now carry `closed_at`.
- `POST /api/hub/owner/content` — extended with `create_reminder` (one-shot or recurring template), `list_reminders`, `cancel_reminder` (soft-cancel, never deletes), `remove_image`, and `image_dataurl` on create/update.
- `POST /api/hub/owner/customers {action:'onboard', email, name, phone?, sms_consent?}` — guest→client, idempotent, attaches to the `HOUSE` trainer; `status='pending'`.
- `GET  /api/hub/kitchen/docs/get` — now returns `doc.image_key` (rendered in the kitchen library).

## 3. Schema (migration `0010_phase5.sql`, applied local + remote — verified)

- `docs.image_key` (R2 key for an attached image)
- `threads.closed_at`
- `reminders.is_template` / `parent_id` / `last_materialized_date` + index `idx_reminders_template`

Remote column presence confirmed via `pragma_table_info`.

## 4. Cron (no new triggers — stays within the 5-cron free-plan cap)

Phase 5 jobs ride existing slots via `EXTRA_ENDPOINTS` in `cron/worker.js`:

- `30 9 * * *` (≈05:30 ET) → also POSTs `/api/hub/admin/reminders-tick` daily (morning ET so instances date to the correct America/New_York day).
- `0 10 * * 1` (Mon 06:00 ET) → also POSTs `/api/hub/admin/backup` weekly.

Both use the same `X-Cron-Key` header already in use by `/api/hub/automations/run`. Deployed: `anejo-cron`, 5 schedules intact.

## 5. Polish details

- **Kitchen board O(N) fix** (`kitchen/orders.js`): the per-pending-order `activity_log … LIKE` scan is replaced by one 7-day query that builds a `surfaced` Set, then diffs in memory.
- **Staff session inactivity timeout** (`_lib/session.js`): staff (`type:'staff'`) sessions expire after **12h idle**, sliding (KV re-write at most every 15 min). Trainers/clients are **never** affected. Sessions minted before this change (no `la`) are grandfathered, not force-logged-out.
- **PWA icons**: real square `icon-192.png` / `icon-512.png` (+ `apple-touch-icon.png`) generated from `emblem.png` padded onto the brand background; manifest fixed (previously declared 192/512 but pointed at a 400×382 non-square file).
- **Tracking plan**: `d1_backup` added to the `automation.run.automation_type` enum.
- **i18n**: 50 new ES strings merged into `hub-i18n.js` (707→757), incl. the owner "Database backups" card.
- **Owner AI-Ops page**: added a "Database backups" card — **Backup now** button + recent-backups list.

## 6. Verification performed

- `node --check` on all 13 changed/new JS files — pass.
- Inline `<script>` parse check on edited HTML (aiops, library) — pass.
- `wrangler pages functions build` — **compiled successfully** (all imports resolve).
- Remote D1 schema — all Phase 5 columns present.
- Production smoke: `/api/hub/admin/backup`, `/reminders-tick`, `/comms/thread-status`, `threads?status=closed` all return **401 Not signed in** (live route, correct auth gate — not 404/500). `icon-192.png` 200 image/png; manifest 200.

## 7. Remaining — needs the owner (not a blocker)

The backup endpoint can only be triggered by an owner session or the cron key (which I don't hold from the CLI). To validate the keystone end-to-end **now**, the owner should open **HUB → AI Ops → Database backups → Backup now** once. Otherwise the weekly cron runs it automatically Monday 10:00 UTC. After the first backup, follow `docs/HUB_BACKUP_RESTORE.md` for the monthly local restore drill.

Bindings are confirmed in place from earlier phases: `env.MEDIA` (R2 `anejo-media`) and `env.CRON_KEY`.
