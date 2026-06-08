// GET /api/me — current session profile.
//   • Trainer sessions: trainer profile + quick stats (used by the dashboard).
//   • Staff sessions:   role context for the HUB shell (Hub.guard / Hub.roleFromMe),
//     which reads top-level `role` (and `staff.role`) to gate kitchen/driver/owner/vendor.
import { json } from '../_lib/util.js';
import { trainerSession } from '../_lib/guard.js';
import { currentRole, currentStaff } from '../_lib/roles.js';

export const onRequestGet = async ({ request, env }) => {
  // Staff sessions: return a role-aware payload the HUB shell understands.
  const ctx = await currentRole(env, request);
  if (ctx && ctx.type === 'staff') {
    const r = await currentStaff(env, request);
    // Whitelist fields — NEVER expose pin_hash / pin_salt / lockout internals.
    const staff = {
      id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      email: ctx.email && /@staff\.anejo\.local$/.test(ctx.email) ? null : ctx.email,
      name: r ? r.name : null,
      phone: r ? r.phone : null,
      is_lead: r ? !!r.is_lead : !!ctx.is_lead,
      employment_type: r ? r.employment_type : null,
      lang: r ? r.lang : 'en',
      must_change_pin: r ? !!r.must_change_pin : false,
    };
    return json({
      authenticated: true,
      type: 'staff',
      role: ctx.role,
      is_lead: staff.is_lead,
      must_change_pin: staff.must_change_pin,
      staff,
    });
  }

  // Trainer sessions: preserve the existing dashboard response shape.
  const sess = await trainerSession(env, request);
  if (!sess) return json({ authenticated: false }, 200);
  if (!env.DB) return json({ authenticated: true, email: sess.email }, 200);

  const trainer = await env.DB
    .prepare('SELECT id, email, name, gym_name, gym_city, affiliate_code FROM trainers WHERE id=?')
    .bind(sess.uid)
    .first();

  const counts = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM clients WHERE trainer_id=?1) AS clients,
         (SELECT COUNT(*) FROM subscriptions WHERE trainer_id=?1 AND status='active') AS active_subs,
         (SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events WHERE trainer_id=?1) AS share_cents_total`
    )
    .bind(sess.uid)
    .first();

  return json({ authenticated: true, trainer, stats: counts });
};
