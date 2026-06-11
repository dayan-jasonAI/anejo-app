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

> Restore is a deliberate, careful, manual operation. It is intentionally **not**
> automated — re-importing rows into a live production database is a high-stakes
> action that a human must drive and verify. Do not run this on a whim.

### Step 1 — Pick the backup to restore

List recent backups (either of these):

```bash
# Via the API (owner session cookie required):
curl -s https://anejocateringco.com/api/hub/admin/backup | jq

# Or directly from R2:
wrangler r2 object list anejo-media --prefix backups/ --remote
```

Identify the exact key you want, e.g.
`backups/2026-06-11/anejo-d1-2026-06-11T14-03.json`.

### Step 2 — Download the backup JSON

```bash
wrangler r2 object get \
  anejo-media/backups/2026-06-11/anejo-d1-2026-06-11T14-03.json \
  --remote --file=backup.json
```

Sanity-check it before going further:

```bash
jq '.meta' backup.json          # table_count, row_counts, any errors/capped
jq '.tables | keys' backup.json # the tables present
```

### Step 3 — Generate INSERT OR REPLACE SQL from the backup

Restore is done with **`INSERT OR REPLACE`** so that re-running it is idempotent and
so that restoring into an existing schema reconciles rows by primary key rather than
duplicating them. The schema itself is **not** in the backup — restore into a
database that already has the current schema (apply `migrations/*.sql` first if you
are rebuilding from empty).

Save this as `backup-to-sql.mjs` and run it with Node:

```js
// backup-to-sql.mjs — turn an Añejo D1 backup JSON into a .sql file of
// INSERT OR REPLACE statements. Usage:
//   node backup-to-sql.mjs backup.json restore.sql            # all tables
//   node backup-to-sql.mjs backup.json restore.sql staff docs # only these tables
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, ...only] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node backup-to-sql.mjs <backup.json> <restore.sql> [table ...]');
  process.exit(1);
}

const data = JSON.parse(readFileSync(inPath, 'utf8'));
const tables = data.tables || {};
const want = only.length ? new Set(only) : null;

// SQLite literal quoting for each JS value type.
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'object') {
    // JSON-in-TEXT columns come back as objects/arrays; re-serialize them.
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const out = [];
out.push('PRAGMA foreign_keys=OFF;');
out.push('BEGIN TRANSACTION;');

for (const [name, rows] of Object.entries(tables)) {
  if (want && !want.has(name)) continue;
  if (!Array.isArray(rows) || rows.length === 0) continue;
  // Use the union of all keys seen, in first-row order, for a stable column list.
  const cols = Object.keys(rows[0]);
  const colSql = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  for (const row of rows) {
    const vals = cols.map((c) => lit(row[c])).join(', ');
    out.push(`INSERT OR REPLACE INTO "${name}" (${colSql}) VALUES (${vals});`);
  }
}

out.push('COMMIT;');
out.push('PRAGMA foreign_keys=ON;');
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`Wrote ${out.length} lines to ${outPath}`);
```

```bash
node backup-to-sql.mjs backup.json restore.sql
```

Open `restore.sql` and **read it** before executing. Confirm the row counts and the
tables match `meta.row_counts`. For a partial restore (e.g. you only need to recover
one accidentally-cleared table), pass just that table name as an extra argument.

### Step 4 — Apply the SQL to D1

```bash
# Dry run against LOCAL first if you have a local copy, to catch obvious errors:
wrangler d1 execute anejo --file restore.sql --local

# Then, once verified, against REMOTE production:
wrangler d1 execute anejo --remote --file restore.sql
```

> Get the database name/binding right (`anejo` — confirm against `wrangler.toml`).
> Because every statement is `INSERT OR REPLACE` inside a single transaction, the
> whole restore either applies cleanly or rolls back.

### Step 5 — Verify

Spot-check a few critical tables after restore:

```bash
wrangler d1 execute anejo --remote --command \
  "SELECT (SELECT COUNT(*) FROM staff) AS staff, (SELECT COUNT(*) FROM suborders) AS suborders;"
```

Compare against `meta.row_counts` from the backup. Sign in to the HUB and confirm
the owner dashboard, recent orders, and a couple of staff records look correct.

---

## Monthly restore-test recommendation

A backup you have never restored is a backup you do not actually have. **Once a
month**, perform a restore drill:

1. Download the latest backup (Step 2).
2. Generate `restore.sql` (Step 3).
3. Apply it to a **local** D1 (`wrangler d1 execute anejo --file restore.sql --local`),
   never to production for the drill.
4. Confirm row counts match `meta.row_counts` and the data is sane.
5. Note the drill (date + result) in ops records.

This proves both the backup contents and the restore procedure are healthy, well
before you ever need them in anger.
