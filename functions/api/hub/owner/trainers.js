// /api/hub/owner/trainers — owner view + management of trainer/gym partners: roster, the clients
// each one referred, the recurring revenue they drive, their 10% commission (earned / pending /
// paid), AND owner controls to add, invite, edit, remove (deactivate), and restore partners.
//   GET  → { ok, trainers:[{ …, clients:[…] }], totals }
//   POST { op:'mark_paid', trainer_id }                 → settle that trainer's pending rev-share.
//   POST { op:'add', name,email,gym_name,gym_city,phone,affiliate_code?,send_invite? } → new partner.
//   POST { op:'update', trainer_id, name?,gym_name?,gym_city?,phone?,affiliate_code? } → edit fields.
//   POST { op:'remove', trainer_id }                    → deactivate (keeps clients + history).
//   POST { op:'restore', trainer_id }                   → reactivate a removed partner.
//   POST { op:'invite', trainer_id }                    → (re)send the sign-in invite email.
// Owner-only. Commission accrues in rev_share_events (one row per paid weekly invoice, written by
// the Square webhook); this page reads + settles it. Amounts in cents.
import { json, bad, id, now, randToken, isEmail, normalizePhone, affiliateCode, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendEmail, emailShell, escHtml, normalizeEmail } from '../../../_lib/email.js';

const cleanCode = (s) => String(s == null ? '' : s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let trainers = [];
  try {
    const res = await env.DB.prepare(
      'SELECT t.id, t.name, t.email, t.affiliate_code, t.gym_name, t.gym_city, t.phone, t.payout_method, ' +
      'COALESCE(t.active, 1) active, ' +
      '(SELECT COUNT(*) FROM clients c WHERE c.trainer_id=t.id) clients_n, ' +
      "(SELECT COUNT(*) FROM subscriptions s WHERE s.trainer_id=t.id AND s.status='active') active_subs, " +
      "(SELECT COALESCE(SUM(weekly_amount_cents),0) FROM subscriptions s WHERE s.trainer_id=t.id AND s.status='active') weekly_cents, " +
      '(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id) earned_cents, ' +
      "(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id AND re.payout_status='pending') pending_cents, " +
      "(SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events re WHERE re.trainer_id=t.id AND re.payout_status='paid') paid_cents " +
      'FROM trainers t ORDER BY active DESC, pending_cents DESC, earned_cents DESC, clients_n DESC'
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
    t.active = t.active === 0 ? 0 : 1;
  }

  // Totals reflect live (active) partners only — a removed partner's history stays on their card.
  const live = trainers.filter((t) => t.active);
  const sum = (k) => live.reduce((s, t) => s + (Number(t[k]) || 0), 0);
  return json({
    ok: true, trainers,
    totals: {
      pending_cents: sum('pending_cents'), paid_cents: sum('paid_cents'),
      earned_cents: sum('earned_cents'), weekly_cents: sum('weekly_cents'),
      active_subs: sum('active_subs'),
    },
  });
};

// Issue a 7-day magic sign-in link and email the trainer a bilingual invite. Returns true on send.
async function inviteTrainer(env, request, email, name) {
  if (!email) return false;
  try {
    const token = randToken(24);
    const expires = now() + 7 * 24 * 60 * 60 * 1000; // owner invites are valid for 7 days
    await env.DB.prepare('INSERT INTO auth_tokens (token, user_email, user_type, expires_at) VALUES (?,?,?,?)')
      .bind(token, email, 'trainer', expires).run();
    const link = `${appBaseUrl(env, request)}/api/auth/verify?token=${token}`;
    const safe = escHtml(name || '');
    const btn = (label) => `<p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-family:Arial,sans-serif">${label}</a></p>`;
    const body =
      `<p>Hi ${safe || 'there'},</p>` +
      `<p>You've been added as an <strong>Añejo Catering Co.</strong> trainer partner. Your portal is where you build personalized meal plans for your clients and track your commissions.</p>` +
      btn('Set up my trainer account') +
      `<hr style="border:none;border-top:1px solid #e6e0d4;margin:22px 0">` +
      `<p>Hola ${safe || ''}:</p>` +
      `<p>Te agregaron como <strong>entrenador asociado</strong> de Añejo Catering Co. En tu portal creas planes de comidas personalizados para tus clientes y ves tus comisiones.</p>` +
      btn('Configurar mi cuenta') +
      `<p style="font-size:12.5px;color:#6b6b6b">This link signs you in and expires in 7 days · Este enlace inicia tu sesión y caduca en 7 días.</p>`;
    await sendEmail(env, {
      to: email,
      subject: "You're an Añejo trainer partner — set up your account · Configura tu cuenta",
      html: emailShell(body),
    });
    return true;
  } catch (_) { return false; }
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = b && b.op;
  const t = now();

  if (op === 'mark_paid') {
    const trainerId = (b.trainer_id || '').toString().trim();
    if (!trainerId) return bad('Missing trainer_id.');
    try {
      const before = await env.DB.prepare("SELECT COALESCE(SUM(share_cents),0) c, COUNT(*) n FROM rev_share_events WHERE trainer_id=? AND payout_status='pending'").bind(trainerId).first();
      await env.DB.prepare("UPDATE rev_share_events SET payout_status='paid' WHERE trainer_id=? AND payout_status='pending'").bind(trainerId).run();
      return json({ ok: true, marked: (before && before.n) || 0, total_cents: (before && before.c) || 0 });
    } catch { return bad('Could not mark paid.', 500); }
  }

  if (op === 'add') {
    const email = normalizeEmail(b.email);
    if (!isEmail(email)) return bad('Enter a valid email address.');
    const name = (b.name || '').toString().trim();
    const gymName = (b.gym_name || '').toString().trim() || null;
    const gymCity = (b.gym_city || '').toString().trim() || null;
    const phone = normalizePhone(b.phone) || null;
    let code = cleanCode(b.affiliate_code) || affiliateCode();
    if (code === 'HOUSE') return bad('HOUSE is a reserved code.');

    const dup = await env.DB.prepare('SELECT id FROM trainers WHERE email=?').bind(email).first();
    if (dup) return bad('A trainer with that email already exists.', 409);

    const tid = id('tr');
    const insert = (c) => env.DB.prepare(
      'INSERT INTO trainers (id, email, name, gym_name, gym_city, phone, affiliate_code, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(tid, email, name || null, gymName, gymCity, phone, c, 1, t, t).run();
    try {
      await insert(code);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) { code = affiliateCode(); await insert(code); } // code collision → regenerate
      else throw e;
    }
    const invited = (b.send_invite === false) ? false : await inviteTrainer(env, request, email, name);
    return json({ ok: true, trainer_id: tid, affiliate_code: code, invited });
  }

  if (op === 'update') {
    const trainerId = (b.trainer_id || '').toString().trim();
    if (!trainerId) return bad('Missing trainer_id.');
    const fields = [], vals = [];
    if (b.name !== undefined) { fields.push('name=?'); vals.push((b.name || '').toString().trim() || null); }
    if (b.gym_name !== undefined) { fields.push('gym_name=?'); vals.push((b.gym_name || '').toString().trim() || null); }
    if (b.gym_city !== undefined) { fields.push('gym_city=?'); vals.push((b.gym_city || '').toString().trim() || null); }
    if (b.phone !== undefined) { fields.push('phone=?'); vals.push(normalizePhone(b.phone) || null); }
    if (b.affiliate_code !== undefined) {
      const c = cleanCode(b.affiliate_code);
      if (!c) return bad('Affiliate code cannot be blank.');
      if (c === 'HOUSE') return bad('HOUSE is a reserved code.');
      fields.push('affiliate_code=?'); vals.push(c);
    }
    if (!fields.length) return bad('Nothing to update.');
    fields.push('updated_at=?'); vals.push(t); vals.push(trainerId);
    try {
      const r = await env.DB.prepare('UPDATE trainers SET ' + fields.join(', ') + ' WHERE id=?').bind(...vals).run();
      if (!r.meta || r.meta.changes !== 1) return bad('Trainer not found.', 404);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) return bad('That affiliate code is already taken.', 409);
      throw e;
    }
    return json({ ok: true });
  }

  if (op === 'remove') {
    const trainerId = (b.trainer_id || '').toString().trim();
    if (!trainerId) return bad('Missing trainer_id.');
    const tr = await env.DB.prepare('SELECT affiliate_code FROM trainers WHERE id=?').bind(trainerId).first();
    if (!tr) return bad('Trainer not found.', 404);
    if (tr.affiliate_code === 'HOUSE') return bad('The House account cannot be removed.');
    await env.DB.prepare('UPDATE trainers SET active=0, updated_at=? WHERE id=?').bind(t, trainerId).run();
    return json({ ok: true });
  }

  if (op === 'restore') {
    const trainerId = (b.trainer_id || '').toString().trim();
    if (!trainerId) return bad('Missing trainer_id.');
    const r = await env.DB.prepare('UPDATE trainers SET active=1, updated_at=? WHERE id=?').bind(t, trainerId).run();
    if (!r.meta || r.meta.changes !== 1) return bad('Trainer not found.', 404);
    return json({ ok: true });
  }

  if (op === 'invite') {
    const trainerId = (b.trainer_id || '').toString().trim();
    if (!trainerId) return bad('Missing trainer_id.');
    const tr = await env.DB.prepare('SELECT email, name FROM trainers WHERE id=?').bind(trainerId).first();
    if (!tr) return bad('Trainer not found.', 404);
    const invited = await inviteTrainer(env, request, tr.email, tr.name);
    return invited ? json({ ok: true, invited: true }) : bad('Could not send the invite email.', 502);
  }

  return bad('Unknown action.');
};
