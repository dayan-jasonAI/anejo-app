// D1 → R2 backup helpers. Files under functions/_lib are not routed.
//
// The keystone of Phase 5: there is currently NO backup of the production D1
// database. These helpers dump the full database to a single JSON object and
// store it in the R2 media bucket (env.MEDIA) under backups/<yyyy-mm-dd>/.
//
// HARD constraints honored here:
//   - Everything is best-effort and NEVER throws (a backup failing must not take
//     down the request that triggered it).
//   - env.MEDIA may be ABSENT locally / before the bucket binding is wired — every
//     entry point feature-detects and degrades to { stored:false }.
//   - The ONLY delete permitted anywhere in Phase 5 is backup rotation in
//     pruneBackups(), and it is hard-scoped to the backups/ prefix.
//
//   listTables(env)                         → string[] of user table names
//   runBackup(env, { triggeredBy, nowMs })  → summary object
//   pruneBackups(env, { keepDays, nowMs })  → { ok, deleted, scanned, ... }
import { now } from './util.js';

// Per-table row cap. A runaway table will not blow the Worker memory/time budget;
// if a table exceeds this we record a `capped` flag in meta so a restore is aware.
const MAX_ROWS_PER_TABLE = 100000;

// Safety cap on deletions per prune run (rotation should be gentle, never a purge).
const MAX_DELETIONS_PER_RUN = 200;

// Pad a number to 2 digits.
function p2(n) {
  return String(n).padStart(2, '0');
}

// yyyy-mm-dd from a millisecond timestamp (UTC — backups key on UTC date).
function ymd(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

// yyyy-mm-ddThh-mm (filesystem/key-safe: colons replaced with dashes).
function ymdhm(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}-${p2(d.getUTCMinutes())}`;
}

// List user tables (excludes SQLite internals, Cloudflare _cf_* and d1_* bookkeeping).
// Returns [] on any failure rather than throwing.
export async function listTables(env) {
  try {
    if (!env || !env.DB) return [];
    const res = await env.DB
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' " +
          "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' " +
          'ORDER BY name'
      )
      .all();
    const rows = (res && res.results) || [];
    return rows.map((r) => r.name).filter((n) => typeof n === 'string' && n.length);
  } catch {
    return [];
  }
}

// Run a full backup. Returns:
//   { ok:false, stored:false, reason:'no_r2' }                    when R2 absent
//   { ok:true,  stored:true, key, tables, rows, bytes, ... }      on success
//   { ok:false, stored:false, reason:'...' }                      on a soft failure
// Never throws.
export async function runBackup(env, { triggeredBy = 'cron', nowMs } = {}) {
  const ms = typeof nowMs === 'number' ? nowMs : now();
  if (!env || !env.MEDIA) return { ok: false, stored: false, reason: 'no_r2' };
  if (!env.DB) return { ok: false, stored: false, reason: 'no_db' };

  let tables = [];
  try {
    tables = await listTables(env);
  } catch {
    tables = [];
  }

  const meta = {
    created_at: ms,
    created_at_iso: new Date(ms).toISOString(),
    table_count: tables.length,
    row_counts: {},
    version: 1,
    triggered_by: triggeredBy,
  };
  const tablesOut = {};
  const errors = {};
  let total = 0;

  for (const name of tables) {
    try {
      // Identifier comes from sqlite_master (not user input); quote defensively anyway.
      const safe = String(name).replace(/"/g, '""');
      const res = await env.DB
        .prepare(`SELECT * FROM "${safe}" LIMIT ${MAX_ROWS_PER_TABLE}`)
        .all();
      const rows = (res && res.results) || [];
      tablesOut[name] = rows;
      meta.row_counts[name] = rows.length;
      total += rows.length;
      if (rows.length >= MAX_ROWS_PER_TABLE) {
        meta.capped = meta.capped || {};
        meta.capped[name] = MAX_ROWS_PER_TABLE;
      }
    } catch (e) {
      // Record the error but keep dumping the other tables.
      errors[name] = (e && e.message) || 'select_failed';
      tablesOut[name] = [];
      meta.row_counts[name] = 0;
    }
  }
  if (Object.keys(errors).length) meta.errors = errors;

  let body;
  try {
    body = JSON.stringify({ meta, tables: tablesOut });
  } catch (e) {
    return { ok: false, stored: false, reason: 'stringify_failed', error: (e && e.message) || 'stringify' };
  }

  const bytes = body.length;
  const key = `backups/${ymd(ms)}/anejo-d1-${ymdhm(ms)}.json`;

  try {
    await env.MEDIA.put(key, body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        rows: String(total),
        tables: String(tables.length),
        triggered_by: String(triggeredBy),
      },
    });
  } catch (e) {
    return { ok: false, stored: false, reason: 'put_failed', error: (e && e.message) || 'put', key };
  }

  return {
    ok: true,
    stored: true,
    key,
    tables: tables.length,
    rows: total,
    bytes,
    errors: Object.keys(errors).length ? errors : undefined,
    created_at: ms,
  };
}

// Parse the yyyy-mm-dd date folder out of a backups/<date>/... key. Null if it
// doesn't match the expected shape (so we never delete an unexpected key).
function dateFromKey(key) {
  const m = /^backups\/(\d{4})-(\d{2})-(\d{2})\//.exec(String(key || ''));
  if (!m) return null;
  // Build a UTC midnight timestamp for that date.
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

// Rotate old backups. Deletes objects under backups/ whose date folder is older
// than keepDays. This is the ONLY delete permitted in Phase 5, and it is hard-
// scoped to keys that both start with backups/ AND parse to a valid date folder.
// Capped at MAX_DELETIONS_PER_RUN. Best-effort; never throws.
export async function pruneBackups(env, { keepDays = 30, nowMs } = {}) {
  const ms = typeof nowMs === 'number' ? nowMs : now();
  if (!env || !env.MEDIA) return { ok: false, deleted: 0, scanned: 0, reason: 'no_r2' };

  const cutoff = ms - keepDays * 24 * 60 * 60 * 1000;
  let scanned = 0;
  let deleted = 0;
  const errors = [];

  try {
    let cursor;
    // Page through the backups/ prefix until exhausted or we hit the deletion cap.
    do {
      let listing;
      try {
        listing = await env.MEDIA.list({ prefix: 'backups/', cursor, limit: 1000 });
      } catch (e) {
        errors.push((e && e.message) || 'list_failed');
        break;
      }
      const objects = (listing && listing.objects) || [];
      for (const obj of objects) {
        scanned++;
        const key = obj && obj.key;
        // Double safety: must be under backups/ AND parse to a real date folder.
        if (typeof key !== 'string' || !key.startsWith('backups/')) continue;
        const dt = dateFromKey(key);
        if (dt == null) continue; // unparseable → never touch
        if (dt >= cutoff) continue; // still within retention
        if (deleted >= MAX_DELETIONS_PER_RUN) {
          return { ok: true, deleted, scanned, capped: true, keepDays };
        }
        try {
          await env.MEDIA.delete(key);
          deleted++;
        } catch (e) {
          errors.push((e && e.message) || 'delete_failed');
        }
      }
      cursor = listing && listing.truncated ? listing.cursor : null;
    } while (cursor);
  } catch (e) {
    errors.push((e && e.message) || 'prune_failed');
  }

  return { ok: true, deleted, scanned, keepDays, errors: errors.length ? errors : undefined };
}
