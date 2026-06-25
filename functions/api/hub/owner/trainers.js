// /api/hub/owner/trainers — owner view of trainer/gym partners: roster, the clients each one
// referred, the recurring revenue they drive, and their 10% commission (earned / pending / paid).
//   GET  → { ok, trainers:[{ …, clients:[…] }], totals }
//   POST { op:'mark_paid', trainer_id }  → flips that trainer's pending rev-share rows to paid.
// Owner-only. Commission accrues in rev_share_events (one row per paid weekly invoice, written by
// the Square webhook); this page just reads + settles it. Amounts in cents.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let trainers = [];
  try {
    const res = await env.DB.prepare(
      'SELECT t.id, t.name, t.email, t.affiliate_code, t.gym_name, t.payout_method, ' +
      '(SELECT COUNT(*) FROM clients c WHERE c.trainer_id=t.id) clients_n, ' +
      "(SELECT COUNT(*) FROM subscriptions s WHERE s.trainer_id=t.id AND s.status='active') active_subs, " +
      "(SELECT COALESCE(SUM(weekly_amount_cents),0) FROM subscriptions s WHERE s.trainer_id=t.id AND s.status='active') weekly_cents, " +
      '(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id) earned_cents, ' +
      "(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id AND re.payout_status='pending') pending_cents, " +
      "(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id AND re.payout_status='paid') paid_cents " +
      'FROM trainers t ORDER BY pending_cents DESC, earned_cents DESC, clients_n DESC'
    ).all();
    trainers = (res && res.results) || [];
  } catch { trainers = []; }

  // Each trainer's clients + their latest subscription (the "tracker"), grouped in one pass.
  const byTrainer = {};
  try {
    const res = await env.DB.prepare(
      'SELECT c.id, c.trainer_id, c.name, c.email, c.status client_status, ' +
      's.status sub_status, s.weekly_amount_cents ' +
      'FROM clients c LEFT JOIN subscriptions s ON s.id = ' +
      '(SELECT id FROM subscriptions s2 WHERE s2.client_id=c.id ORDER BY started_at DESC LIMIT 1) ' +
      'ORDER BY c.trainer_id, (s.status=\'active\') DESC, c.created_at DESC'
    ).all();
    for (const r of (res && res.results) || []) {
      (byTrainer[r.trainer_id] = byTrainer[r.trainer_id] || []).push({
        id: r.id, name: r.name, email: r.email, client_status: r.client_status,
        sub_status: r.sub_status || null, weekly_amount_cents: r.weekly_amount_cents || 0,
      });
    }
  } catch { /* none */ }
  for (const t of trainers) {
    t.clients = byTrainer[t.id] || [];
    t.is_house = t.affiliate_code === 'HOUSE';
  }

  const sum = (k) => trainers.reduce((s, t) => s + (Number(t[k]) || 0), 0);
  return json({
    ok: true, trainers,
    totals: {
      pending_cents: sum('pending_cents'), paid_cents: sum('paid_cents'),
      earned_cents: sum('earned_cents'), weekly_cents: sum('weekly_cents'),
      active_subs: sum('active_subs'),
    },
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  if (!b || b.op !== 'mark_paid') return bad('Unknown action.');
  const trainerId = (b.trainer_id || '').toString().trim();
  if (!trainerId) return bad('Missing trainer_id.');
  const t = now();
  try {
    const before = await env.DB.prepare("SELECT COALESCE(SUM(share_cents),0) c, COUNT(*) n FROM rev_share_events WHERE trainer_id=? AND payout_status='pending'").bind(trainerId).first();
    await env.DB.prepare("UPDATE rev_share_events SET payout_status='paid' WHERE trainer_id=? AND payout_status='pending'").bind(trainerId).run();
    return json({ ok: true, marked: (before && before.n) || 0, total_cents: (before && before.c) || 0 });
  } catch { return bad('Could not mark paid.', 500); }
};
