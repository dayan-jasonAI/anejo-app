// Añejo HUB — the trust ledger (0072): per-category graduated autonomy for the social planner.
//
// Owner decisions #1/#4 in one sentence: Aña's drafts are ALL human-approved at first, a
// category earns auto-publish only after AUTO_PUBLISH_AFTER clean approvals in a row, and the
// switch itself is the OWNER'S — code counts, code shows "eligible", code never flips it.
//
// "Clean" requires the original caption and visual snapshot plus a current visual audit.
// Earlier versions used only the caption hash: the planner stores a hash of the caption AS DRAFTED,
// and approval (schedule/publish) compares the caption at that moment against it. Equal means
// the owner shipped Aña's words untouched; different means the draft needed fixing, and a draft
// that needed fixing is evidence the category is NOT ready to run unsupervised — so the streak
// resets to zero rather than merely not counting.
//
// Everything here is best-effort by design: trust bookkeeping must never break the approval or
// publish it is riding along with, and a pre-0072 database simply records nothing.
// Files under functions/_lib are NOT routed.
import { now } from './hub.js';
import { raiseAlert } from './alerts.js';
import { SOCIAL_AUDIT_SNAPSHOT, SOCIAL_AUDIT_CURRENT } from './social_audit.js';

// The five fixed lanes. The planner is asked to file every post under exactly one of these;
// anything else it invents is stored as NULL and never counts toward (or against) a streak.
export const TRUST_CATEGORIES = ['menu', 'macro_portal', 'catering', 'brand_story', 'promo'];

// Clean approvals in a row before the HUB shows a category as eligible — and before the
// toggle endpoint will accept auto_publish=1. Five, per the owner's decision.
export const AUTO_PUBLISH_AFTER = 5;

// Same djb2 shape as automations.js tinyHash: stable, cheap, and NOT cryptographic — it only
// has to answer "is this string the one we drafted", never resist an adversary.
export function captionHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Record one human approval of a planner draft. Called from the owner social endpoint on the
// FIRST approval of a post (draft → scheduled, or draft → published directly). Reads the post
// itself rather than trusting caller-supplied fields, so a pre-0072 schema (missing columns)
// lands in the catch and the approval proceeds untouched.
export async function noteTrustApproval(env, postId) {
  if (!env || !env.DB || !postId) return { counted: false };
  try {
    const row = await env.DB.prepare(`SELECT source, category, caption, original_caption_hash,
      original_design_snapshot, audit_status, audit_scope, audit_snapshot,
      ${SOCIAL_AUDIT_SNAPSHOT} AS revision_snapshot, ${SOCIAL_AUDIT_CURRENT} AS audit_current FROM social_posts WHERE id=?`).bind(postId).first();
    if (!row || row.source !== 'planner' || !TRUST_CATEGORIES.includes(row.category) || !row.original_caption_hash) return { counted: false };
    const clean = captionHash(row.caption || '') === row.original_caption_hash &&
      !!row.original_design_snapshot && row.original_design_snapshot === row.revision_snapshot;
    // Legacy drafts have no original visual evidence and cannot earn autonomy. A known
    // caption correction still resets the lane, even for a legacy draft.
    if (!row.original_design_snapshot && captionHash(row.caption || '') === row.original_caption_hash) return { counted: false };
    if (clean && (!row.audit_current || row.audit_status !== 'pass' || row.audit_scope !== 'caption_and_media' || row.audit_snapshot !== row.revision_snapshot)) return { counted: false };
    const t = now();
    // One clean credit per post; each corrected revision resets once. A corrected
    // post can never earn clean credit again, even if someone restores its original text.
    // Event and streak mutation are one transaction, including the revision guard.
    const event = env.DB.prepare(`INSERT OR IGNORE INTO social_trust_approvals (post_id, decision, revision, category, approved_at)
      SELECT id, ?, ?, category, ? FROM social_posts WHERE id=? AND ${SOCIAL_AUDIT_SNAPSHOT}=?
      AND source='planner' AND category=? AND original_caption_hash=?
      AND COALESCE(original_design_snapshot,'')=?
      AND (?='edited' OR (audit_status='pass' AND audit_scope='caption_and_media' AND ${SOCIAL_AUDIT_CURRENT}
        AND NOT EXISTS (SELECT 1 FROM social_trust_approvals WHERE post_id=social_posts.id AND decision='edited')))`)
      .bind(clean ? 'clean' : 'edited', row.revision_snapshot, t, postId, row.revision_snapshot, row.category, row.original_caption_hash,
        row.original_design_snapshot || '', clean ? 'clean' : 'edited');
    const update = clean
      ? env.DB.prepare(`INSERT INTO trust_ledger (category, approved_clean, auto_publish, updated_at)
          SELECT ?,1,0,? WHERE changes()=1
          ON CONFLICT(category) DO UPDATE SET approved_clean = approved_clean + 1, updated_at = excluded.updated_at`).bind(row.category,t)
      : env.DB.prepare(`INSERT INTO trust_ledger (category, approved_clean, auto_publish, updated_at)
          SELECT ?,0,0,? WHERE changes()=1
          ON CONFLICT(category) DO UPDATE SET approved_clean = 0, updated_at = excluded.updated_at`).bind(row.category,t);
    const results = await env.DB.batch([event, update]);
    if (results[0].meta?.changes !== 1) return { counted: false };
    // 2026-08-11 — tell the owner the moment a lane EARNS eligibility. The auto-publish switch
    // is his alone (api/hub/owner/trust.js), which means a lane can sit at five clean approvals
    // indefinitely because nobody mentioned it. Deduped per lane while the alert is open:
    // eligibility is a STATE, not an event, so re-announcing it on every further approval would
    // train him to ignore the one alert that asks him for a decision.
    // The marketing role is notified too — the streak is the result of her work, and she is the
    // one who will ask him about it.
    if (clean) await maybeAnnounceEligible(env, row.category);

    return { counted: true, clean, category: row.category };
  } catch { return { counted: false }; }
}

// Raise 'trust_lane_eligible' the first time a lane reaches the bar. Never throws: a failure here
// must not affect the approval that triggered it.
async function maybeAnnounceEligible(env, category) {
  try {
    const r = await env.DB
      .prepare('SELECT approved_clean, auto_publish FROM trust_ledger WHERE category=?')
      .bind(category).first();
    if (!r) return;
    // Already running unattended → nothing to decide.
    if (Number(r.auto_publish) === 1) return;
    // Announce on the exact approval that crosses the bar, not every one after it. The dedupe
    // key below is the real guard; this keeps the common case from even querying.
    if (Number(r.approved_clean) < AUTO_PUBLISH_AFTER) return;

    await raiseAlert(env, {
      alert_type: 'trust_lane_eligible',
      severity: 'info',
      title: `"${category}" has earned auto-publish — your call`,
      body: `${AUTO_PUBLISH_AFTER} drafts in a row approved without an edit. Open the trust cockpit to turn it on, or leave it off and it keeps asking you. Only you can flip this switch.`,
      team: 'marketing',
      source: 'trust_ledger',
      ref_type: 'trust_lane',
      ref_id: category,
      dedupe_key: `trust_eligible:${category}`,
      notifyRoles: ['marketing'],
    });
  } catch { /* best-effort — never block an approval */ }
}

// The set of categories the owner has switched to auto-publish. Empty set on any failure —
// including a pre-0072 database — so every caller degrades to the human-approval path.
export async function autoPublishCategories(env) {
  if (!env || !env.DB) return new Set();
  try {
    const r = await env.DB.prepare('SELECT category FROM trust_ledger WHERE auto_publish=1 AND approved_clean>=?').bind(AUTO_PUBLISH_AFTER).all();
    return new Set(((r && r.results) || []).map((x) => x.category));
  } catch { return new Set(); }
}
