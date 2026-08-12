// Añejo HUB — the trust ledger (0072): per-category graduated autonomy for the social planner.
//
// Owner decisions #1/#4 in one sentence: Aña's drafts are ALL human-approved at first, a
// category earns auto-publish only after AUTO_PUBLISH_AFTER clean approvals in a row, and the
// switch itself is the OWNER'S — code counts, code shows "eligible", code never flips it.
//
// "Clean" is defined by the caption hash: the planner stores a hash of the caption AS DRAFTED,
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
    const row = await env.DB
      .prepare('SELECT source, category, caption, original_caption_hash FROM social_posts WHERE id=?')
      .bind(postId).first();
    // Only planner drafts that were filed under a real category carry trust signal — a post the
    // owner wrote by hand says nothing about whether Aña's drafts are clean.
    if (!row || row.source !== 'planner' || !row.category || !row.original_caption_hash) return { counted: false };
    const clean = captionHash(row.caption || '') === row.original_caption_hash;
    const t = now();
    if (clean) {
      await env.DB.prepare(
        `INSERT INTO trust_ledger (category, approved_clean, auto_publish, updated_at) VALUES (?,1,0,?)
         ON CONFLICT(category) DO UPDATE SET approved_clean = approved_clean + 1, updated_at = excluded.updated_at`
      ).bind(row.category, t).run();
    } else {
      // An edit RESETS the streak — the count is consecutive clean approvals, not lifetime
      // total. auto_publish is deliberately left alone in both branches: flipping it, either
      // direction, is the owner's move only.
      await env.DB.prepare(
        `INSERT INTO trust_ledger (category, approved_clean, auto_publish, updated_at) VALUES (?,0,0,?)
         ON CONFLICT(category) DO UPDATE SET approved_clean = 0, updated_at = excluded.updated_at`
      ).bind(row.category, t).run();
    }
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
    const r = await env.DB.prepare('SELECT category FROM trust_ledger WHERE auto_publish=1').all();
    return new Set(((r && r.results) || []).map((x) => x.category));
  } catch { return new Set(); }
}
