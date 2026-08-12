// /api/hub/owner/trust — the trust ledger desk (owner-only).
//   GET                                  → all five lanes: streak, toggle state, eligibility
//   POST { category, auto_publish:0|1 }  → the OWNER's toggle — the one switch code never flips
//
// The ledger counts consecutive clean approvals per category (see _lib/trust_ledger.js); this
// endpoint is where the count turns into autonomy. Enabling requires the streak the owner set
// as the bar (5): "eligible" is earned, not granted — a category that has never shipped five
// untouched drafts in a row has not demonstrated it can run without eyes on it. Disabling is
// always allowed: taking autonomy away must never have preconditions.
import { json, bad, now } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { TRUST_CATEGORIES, AUTO_PUBLISH_AFTER } from '../../../_lib/trust_ledger.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  // Merge over the fixed list rather than trusting the table's contents: the five lanes exist
  // whether or not 0072 has seeded (or even created) the table, so the cockpit always shows
  // every lane instead of a blank card on a fresh environment.
  const byCat = {};
  try {
    const r = await env.DB.prepare('SELECT category, approved_clean, auto_publish, updated_at FROM trust_ledger').all();
    for (const row of (r && r.results) || []) byCat[row.category] = row;
  } catch { /* pre-0072 → zeros below */ }

  return json({
    ok: true,
    threshold: AUTO_PUBLISH_AFTER,
    categories: TRUST_CATEGORIES.map((c) => {
      const row = byCat[c] || {};
      const streak = Number(row.approved_clean) || 0;
      return {
        category: c,
        approved_clean: streak,
        auto_publish: Number(row.auto_publish) === 1 ? 1 : 0,
        eligible: streak >= AUTO_PUBLISH_AFTER,
        updated_at: row.updated_at || null,
      };
    }),
  });
};

// OWNER ONLY, not MARKETING_DESK. Reading the ledger is the marketing expert's business —
// it tells her which lanes still need Dayan's eyes. Flipping the switch is not: auto_publish=1
// is precisely the act of REMOVING the owner from the approval loop, and a role whose work is
// the thing being approved cannot be the one who decides it no longer needs approving.
// (Widened to the desk in error on 2026-08-11 and narrowed back the same day.)
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const category = String((b && b.category) || '').trim();
  if (!TRUST_CATEGORIES.includes(category)) return bad('Unknown category.');
  const on = Number(b && b.auto_publish) === 1 ? 1 : 0;

  const t = now();
  if (on) {
    // Autonomy is EARNED: the switch only goes on once the lane has the streak. Guarded in the
    // UPDATE itself so a stale page (streak reset by an edit a minute ago) cannot re-enable.
    const r = await env.DB.prepare(
      'UPDATE trust_ledger SET auto_publish=1, updated_at=? WHERE category=? AND approved_clean>=?'
    ).bind(t, category, AUTO_PUBLISH_AFTER).run().catch(() => null);
    if (!r || !r.meta || r.meta.changes !== 1) {
      return bad(`Not eligible yet — ${AUTO_PUBLISH_AFTER} clean approvals in a row first.`, 409);
    }
  } else {
    // Turning autonomy OFF is unconditional, and an upsert: even on a lane the seed missed,
    // "off" must always be a state the owner can reach.
    await env.DB.prepare(
      `INSERT INTO trust_ledger (category, approved_clean, auto_publish, updated_at) VALUES (?,0,0,?)
       ON CONFLICT(category) DO UPDATE SET auto_publish=0, updated_at=excluded.updated_at`
    ).bind(category, t).run().catch(() => null);
  }
  return json({ ok: true, category, auto_publish: on });
};
