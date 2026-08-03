// Post provenance (0076): what CAUSED a post to look the way it does — which owner training
// rules were in force, which campaign brief (if any) directed it, its category, and its format.
// Files under functions/_lib are not routed.
//
// WHY THIS FILE EXISTS. The owner just built a training surface (training_rules/training_examples,
// functions/_lib/training.js) and campaign briefs already exist (team_briefs, team_lead.js). Both
// now feed the weekly planner (functions/_lib/automations.js — NOT edited here; the planner calls
// stampPostProvenance() after it writes a post, this file only owns the storage contract). But
// their EFFECT was invisible: nothing recorded which rules or brief produced a given post, so
// "reach went up" and "I wrote a rule" could never be connected. This is that missing link.
//
// THE ONE THING THIS SCHEMA MUST GET RIGHT: a post from before this table existed has NO ROW —
// that must read as UNKNOWN, never as "zero rules were active." Those are different facts, and
// conflating them would let a training rule look "proven" or "disproven" by posts it never
// touched. See the migration (0076_post_provenance.sql) for the full convention:
//   · no row               → unknown (predates this feature, or the stamp call never ran)
//   · row, rule_ids = '[]' → known: confirmed zero rules were active
//   · row, brief_id = NULL → known: confirmed no brief directed this post
import { now, toJson, parseJson } from './hub.js';

/**
 * Best-effort upsert of a post's provenance. Never throws into the caller — a provenance write
 * must never be able to sink the post it is describing, or a caller in the hot path of drafting
 * a week of content would have one more way to fail.
 *
 * Only the fields ACTUALLY PASSED are written; a field left `undefined` (simply not in the call)
 * is left untouched on an existing row, so a later call — e.g. once Creative Studio decides a
 * post is a 3-slide carousel, which is not known at draft time — can fill in `format` and
 * `slideCount` without erasing the `ruleIds`/`briefId`/`category` an earlier call already wrote.
 * Pass a field as `null` (not merely omit it) to explicitly record "recorded, and confirmed none/
 * not applicable" — e.g. `briefId: null` means "no brief directed this post," a known fact, not
 * "we didn't check."
 *
 *   await stampPostProvenance(env, {
 *     postId: 'sp_abc123',
 *     ruleIds: ['rul_1', 'rul_7'],   // training_rules.id values active when this post was written
 *     briefId: 'brf_9' | null,       // the team_briefs.id that directed it, or null for none
 *     category: 'menu',              // one of TRUST_CATEGORIES (trust_ledger.js), or null
 *     format: 'single' | 'carousel', // omit until Studio has actually decided
 *     slideCount: 3,                 // carousel slide count; omit/null for a single image
 *   });
 *
 * Returns { ok: true } on a successful write, { ok: false, reason } otherwise — the reason is for
 * logs/tests, never surfaced to an end user (this is plumbing, not a user-facing feature).
 */
export async function stampPostProvenance(env, opts = {}) {
  const postId = String((opts && opts.postId) || '').trim();
  if (!env || !env.DB || !postId) return { ok: false, reason: 'missing_args' };

  const fields = {};
  if (opts.ruleIds !== undefined) {
    const arr = Array.isArray(opts.ruleIds) ? opts.ruleIds.filter((x) => x != null && x !== '') : [];
    fields.rule_ids = toJson(arr);
  }
  if (opts.briefId !== undefined) fields.brief_id = opts.briefId ? String(opts.briefId) : null;
  if (opts.category !== undefined) fields.category = opts.category ? String(opts.category) : null;
  if (opts.format !== undefined) {
    fields.format = (opts.format === 'single' || opts.format === 'carousel') ? opts.format : null;
  }
  if (opts.slideCount !== undefined) {
    const n = Number(opts.slideCount);
    fields.slide_count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }

  const cols = Object.keys(fields);
  const t = now();
  try {
    const insertCols = ['post_id', ...cols, 'created_at', 'updated_at'];
    const insertVals = [postId, ...cols.map((c) => fields[c]), t, t];
    const placeholders = insertVals.map(() => '?').join(',');
    // ON CONFLICT only reassigns the columns THIS call actually supplied (`cols`) — referencing
    // excluded.<col> for a column outside the INSERT's column list would read as NULL and blank
    // out a fact a previous call already recorded, exactly the erasure this function promises
    // never to do.
    const updateSet = cols.length
      ? cols.map((c) => `${c}=excluded.${c}`).join(', ') + ', updated_at=excluded.updated_at'
      : 'updated_at=excluded.updated_at';
    await env.DB.prepare(
      `INSERT INTO post_provenance (${insertCols.join(',')}) VALUES (${placeholders})
       ON CONFLICT(post_id) DO UPDATE SET ${updateSet}`
    ).bind(...insertVals).run();
    return { ok: true };
  } catch {
    // Pre-0076 schema, or any other DB hiccup — the post itself already landed; losing its
    // provenance is recoverable, losing the post it describes would not be.
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Read back one post's provenance. Returns `{ recorded: false }` when there is no row — the
 * UNKNOWN case — never a row of nulls that could be mistaken for "recorded as empty." Used by
 * tests and any drill-down UI; the rollup in instagram_insights.js queries in bulk instead.
 */
export async function getPostProvenance(env, postId) {
  if (!env || !env.DB || !postId) return { recorded: false };
  try {
    const row = await env.DB.prepare(
      'SELECT post_id, rule_ids, brief_id, category, format, slide_count, created_at, updated_at FROM post_provenance WHERE post_id=?'
    ).bind(postId).first();
    if (!row) return { recorded: false };
    return {
      recorded: true,
      postId: row.post_id,
      ruleIds: parseJson(row.rule_ids, null),
      briefId: row.brief_id ?? null,
      category: row.category ?? null,
      format: row.format ?? null,
      slideCount: row.slide_count ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return { recorded: false };
  }
}
