# Añejo HUB — D1 Backup & Restore

The keystone of Phase 5. Until this system shipped, the production D1 database had
**no backup at all**. This document explains what is backed up, where it lives, how
long it is kept, and — most importantly — the step-by-step procedure to **restore**
from a backup if disaster strikes.

---

## What is backed up

- **The entire D1 database** (`env.DB`) is dumped as a single JSON object.
- Every user table is included (SQLite internals and Cloudflare `_cf_*` / `d1_*`
  bookkeeping tables are excluded — those are recreated by D1 itself).
- Each table is capped at **100,000 rows** per backup. If a table ever exceeds that,
  the backup still succeeds and records a `meta.capped` entry naming the table so a
  restore is aware the dump is partial for that table. (No current table is anywhere
  near this cap.)

### Backup file shape

```json
{
  "meta": {
    "created_at": 1749600000000,
    "created_at_iso": "2026-06-11T00:00:00.000Z",
    "table_count": 42,
    "row_counts": { "staff": 12, "suborders": 318, "...": 0 },
    "version": 1,
    "triggered_by": "cron",
    "capped": { "...": 100000 },   // only present if a table hit the cap
    "errors": { "...": "..." }      // only present if a table failed to dump
  },
  "tables": {
    "staff": [ { "id": "...", "name": "...", ... }, ... ],
    "suborders": [ ... ],
    ...
  }
}
```

If a single table errors during the dump, the backup **continues** with the other
tables and records the failure under `meta.errors[<table>]`. A backup is therefore
best-effort and as-complete-as-possible rather than all-or-nothing.

---

## Where backups live

- **Bucket:** the R2 media bucket (`anejo-media`, bound as `env.MEDIA`).
- **Key layout:** `backups/<yyyy-mm-dd>/anejo-d1-<yyyy-mm-ddThh-mm>.json`
  (date folder is UTC; the time in the filename is also UTC, with `:` replaced by `-`
  so the key is filesystem-safe).
- **Content type:** `application/json`, with `customMetadata.rows` /
  `customMetadata.tables` / `customMetadata.triggered_by` set for quick listing.

If R2 is not yet wired (`env.MEDIA` absent), the backup endpoint degrades gracefully:
it returns HTTP 200 with `{ ok:false, reason:"R2 not enabled" }` and does nothing
destructive.

---

## When backups run

- **Weekly, via cron** — a tiny Workers cron (`cron/worker.js`, owned by the
  integrator) should `POST /api/hub/admin/backup` once a week with the
  `X-Cron-Key` header. Suggested: fold into the existing **Monday** cron slot.
- **On demand** — the owner can trigger a backup any time from the AI Ops page
  ("Backup now") or by POSTing the same endpoint while signed in as owner.

### The endpoint

`POST /api/hub/admin/backup`
- **Auth:** an **owner** session **OR** an `X-Cron-Key: <env.CRON_KEY>` header
  (constant-time compared).
- **Effect:** runs the backup, then rotates old backups (see retention), writes an
  `agent_runs` row (`automation_type='d1_backup'`), and fires an
  `automation.run` tracking event.
- **Response (success):**
  ```json
  {
    "ok": true, "stored": true, "triggered_by": "owner",
    "key": "backups/2026-06-11/anejo-d1-2026-06-11T14-03.json",
    "tables": 42, "rows": 1234, "bytes": 845213,
    "pruned": 0, "retention_days": 30, "duration_ms": 412
  }
  ```

`GET /api/hub/admin/backup` (owner only) → the 20 newest backups
(`{ key, size, uploaded, rows }`) plus `{ r2_enabled: boolean }`.

---

## Retention

- Backups are kept for **30 days**.
- After each run, `pruneBackups` lists the `backups/` prefix and deletes objects
  whose date folder is older than 30 days.
- **This is the only deletion anywhere in Phase 5.** It is hard-scoped: a key is
  only ever deleted if it both starts with `backups/` **and** parses to a valid
  `yyyy-mm-dd` date folder. Deletions are capped at **200 per run** to keep rotation
  gentle. Non-backup R2 keys are never touched.

---

## RESTORE RUNBOOK

> **Rehearsed 2026-07-25** against a scratch database (`anejo-restore-drill`) using the real
> 2026-07-20 backup: 64 tables / 8,532 rows restored, every spot-checked table matching the
> backup manifest exactly. The steps below are the ones that actually ran. Three commands in the
> previous version of this runbook did **not** execute — see "What the drill corrected" at the end.

### Step 0 — Restore the SCHEMA first (empty database only)

The backup contains **data, not schema**. Into a fresh database, replay the migrations first:

```bash
for f in $(ls migrations/*.sql | sort); do
  wrangler d1 execute <DB> --remote --file "$f"
done
```

**Expect exactly one failure:** `0007_client_phone.sql` → `duplicate column name: phone`. It is
harmless — `clients.phone` is already added by an earlier migration. Any *other* failure is real.
(Migration ordinals `0002 0006 0007 0017 0021 0033 0034` are each used twice; filename order is
what the drill used and it reproduced production's 67 tables exactly.)

### Step 1 — Find the backup

`wrangler r2 object list` **does not exist in wrangler 4.** Use the HUB (owner session):
`GET /api/hub/admin/backup` lists the 20 most recent keys. Or derive it — backups run Mondays
10:00 UTC and the key is deterministic:

```
backups/<yyyy-mm-dd>/anejo-d1-<yyyy-mm-dd>T<hh>-<mm>.json
```

### Step 2 — Download it

```bash
wrangler r2 object get "anejo-media/backups/2026-07-20/anejo-d1-2026-07-20T10-00.json" \
  --file backup.json --remote
```

### Step 3 — Build the FK graph from the TARGET database, then generate SQL

Tables must be inserted parents-first: D1 enforces foreign keys and **rejects
`PRAGMA foreign_keys=OFF`** in a `--file` batch, so ordering is the only way through.

```bash
wrangler d1 execute <DB> --remote --json \
  --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL" > schema.json

node scripts/restore-from-backup.mjs --deps schema.json deps.json
node scripts/restore-from-backup.mjs backup.json restore.sql deps.json
```

Pass extra table names to restore only those (e.g. one accidentally-cleared table).

### Step 4 — Apply

```bash
wrangler d1 execute <DB> --remote --file restore.sql
```

⚠️ **This is NOT atomic.** D1 rejects `BEGIN TRANSACTION`/`COMMIT`, so there is no all-or-nothing
rollback. It *is* idempotent — every statement is `INSERT OR REPLACE` — so a partial restore can
simply be re-run and will converge. Drill timing: 8,532 statements in ~300ms.

### Step 5 — Verify against the manifest

Compare live counts to `meta.row_counts` in the backup. Keep each query under ~15 UNION terms —
SQLite errors with *"too many terms in compound SELECT"* beyond that:

```bash
wrangler d1 execute <DB> --remote --command \
  "SELECT 'orders' t,COUNT(*) n FROM orders UNION ALL SELECT 'clients',COUNT(*) FROM clients"
```

Then sign in to the HUB and confirm the dashboard, recent orders and a couple of staff records.

### What the drill corrected

| Previously documented | Reality |
|---|---|
| `wrangler r2 object list …` | **Not a wrangler 4 command.** Step 1 could not run at all. |
| `PRAGMA foreign_keys=OFF;` | **Rejected by D1.** FKs stay on → restore fails on constraint violations unless tables are dependency-ordered. |
| `BEGIN TRANSACTION; … COMMIT;` | **Rejected by D1.** The claim that a restore "either applies cleanly or rolls back" was false. |

### Restore drill — do this quarterly

An untested restore is a hypothesis, not a capability. Create a scratch DB
(`wrangler d1 create anejo-restore-drill`), run Steps 0-5 against it, verify, then
`wrangler d1 delete anejo-restore-drill`. Nothing touches production.

**Current RPO: 7 days** (weekly Monday backup). Cloudflare D1 Time Travel may offer a much better
point-in-time option — worth evaluating; it is not currently part of this procedure.
