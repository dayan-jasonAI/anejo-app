// /api/hub/owner/partners — the Affiliate Program desk (owner-only).
//   GET                                   → partners w/ live earnings + every promo code
//   POST { op:'onboard', ... }            → onboard a creator partner end-to-end (trainer row +
//                                           live affiliate code + welcome/onboarding email)
//   POST { op:'set_payout', ... }         → cash vs 1.5x Añejo credit
//   POST { op:'mark_paid', ... }          → settle pending commission
//   POST { op:'create_code', ... }        → manually mint a promo code (campaign/customer/affiliate)
//   POST { op:'set_code_status', ... }    → enable / disable a code
//
// Partners are `trainers` rows (same rails as gym affiliates), so commission on subscription
// renewals flows through the EXISTING per-invoice rev-share path with no extra plumbing.
import { json, bad, id, now, isEmail, normalizePhone, affiliateCode, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendEmail, emailShell, escHtml, normalizeEmail } from '../../../_lib/email.js';
import { ensureAffiliateCode, payoutOptions, norm } from '../../../_lib/promo.js';

const DEFAULT_COMMISSION = 10;
const cleanCode = (c) => norm(c).replace(/[^A-Z0-9._-]/g, '').slice(0, 32);

// ---------- onboarding email ----------
async function sendPartnerWelcome(env, request, p) {
  if (!env.RESEND_API_KEY || !isEmail(p.email)) return false;
  const base = appBaseUrl(env, request).replace(/\/$/, '');
  const link = `${base}/order?ref=${encodeURIComponent(p.code)}`;
  const html = emailShell([
    `<p>Hi ${escHtml((p.name || '').split(/\s+/)[0] || 'there')},</p>`,
    `<p>Welcome to the <strong>Añejo Founding Creators</strong> program. You're in — here's everything you need.</p>`,
    `<div style="margin:22px 0;padding:18px;border:1px solid #C6A85B;border-radius:10px;background:#fdfaf2">
       <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8B6B3E">Your code</p>
       <p style="margin:0 0 12px;font-size:26px;font-weight:700;letter-spacing:.08em;color:#1A3D2E">${escHtml(p.code)}</p>
       <p style="margin:0;font-size:14px;color:#3d4a41"><strong>Your link:</strong> <a href="${link}">${escHtml(link)}</a></p>
     </div>`,
    `<p><strong>What you earn:</strong> ${p.commission_pct}% of every sale on your code — <strong>including weekly-plan renewals</strong>, month after month, for as long as they stay subscribed. Paid monthly in cash, or take it as Añejo credit at 1.5&times; value ($100 &rarr; $150).</p>`,
    `<p><strong>What your people get:</strong> a <strong>free Añejo Fit cold-press drink</strong> on their first order, plus double rewards points.</p>`,
    `<p><strong>Point them at the weekly plans</strong> (anejocateringco.com/subscribe) — that's where your recurring income comes from. A single subscriber can be worth more each month than a dozen one-off bowls.</p>`,
    `<p style="margin-top:22px"><strong>Two rules, and they matter:</strong></p>`,
    `<ol style="font-size:14px;color:#3d4a41;line-height:1.65">
       <li><strong>Disclose the partnership.</strong> Put <code>#ad</code> at the top of the caption, and say it out loud on video. It's the law (FTC), and it protects us both.</li>
       <li><strong>Talk about food, not medicine.</strong> Flavor, ingredients, macros, convenience — all good. Never say Añejo cures, reverses, fixes, or treats anything, and don't name medical conditions or lab numbers. The furthest we go is "designed to support healthier eating habits."</li>
     </ol>`,
    `<p>Questions, ideas, or want us to shoot something with you? Just reply — this comes straight to me.</p>`,
    `<p>— Dayan<br>Añejo Catering Co.<br><em>Clean Fuel. Bold Flavor. Built for Life.</em> 🌿</p>`,
  ].join(''));
  try {
    await sendEmail(env, { to: p.email, subject: `You're in — your Añejo creator code: ${p.code}`, html });
    return true;
  } catch { return false; }
}

// ---------- GET ----------
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  // Every promo code, with how many times it's been redeemed.
  let codes = [];
  try {
    const r = await env.DB.prepare(
      `SELECT pc.code, pc.kind, pc.bound_email, pc.partner_id, pc.pct_off, pc.points_mult, pc.perk,
              pc.commission_pct, pc.expires_at, pc.max_uses, pc.uses, pc.status, pc.note, pc.created_at,
              (SELECT COUNT(*) FROM promo_redemptions pr WHERE pr.code = pc.code) AS redemptions
         FROM promo_codes pc ORDER BY pc.created_at DESC LIMIT 500`
    ).all();
    codes = (r && r.results) || [];
  } catch { codes = []; }

  // Partners = trainers that own an affiliate code. Earnings come from rev_share_events, which is
  // written by the Square webhook for BOTH à-la-carte orders and every subscription invoice.
  let partners = [];
  try {
    const r = await env.DB.prepare(
      `SELECT t.id, t.name, t.email, t.phone, t.affiliate_code, t.gym_name, t.gym_city,
              t.payout_method, t.active, t.created_at,
              COALESCE((SELECT SUM(share_cents) FROM rev_share_events e
                         WHERE e.trainer_id = t.id AND e.payout_status='pending'),0) AS pending_cents,
              COALESCE((SELECT SUM(share_cents) FROM rev_share_events e
                         WHERE e.trainer_id = t.id AND e.payout_status='paid'),0)    AS paid_cents,
              COALESCE((SELECT COUNT(*) FROM rev_share_events e WHERE e.trainer_id = t.id),0) AS events,
              COALESCE((SELECT COUNT(*) FROM subscriptions s WHERE s.trainer_id = t.id
                         AND s.status IN ('active','paused')),0) AS active_subs
         FROM trainers t
        WHERE t.affiliate_code IS NOT NULL AND t.affiliate_code <> 'HOUSE'
        ORDER BY pending_cents DESC, t.created_at DESC`
    ).all();
    partners = ((r && r.results) || []).map((p) => {
      const po = payoutOptions(p.pending_cents || 0);
      return { ...p, payout_cash_cents: po.cash_cents, payout_credit_cents: po.credit_cents };
    });
  } catch { partners = []; }

  return json({ ok: true, partners, codes, default_commission_pct: DEFAULT_COMMISSION });
};

// ---------- POST ----------
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';
  const t = now();

  // --- Onboard a creator partner: trainer row + live code + onboarding email, in one action.
  if (op === 'onboard') {
    const email = normalizeEmail(b.email);
    if (!isEmail(email)) return bad('Enter a valid email address.');
    const name = (b.name || '').toString().trim();
    if (!name) return bad('Enter the partner’s name.');
    const handle = (b.handle || '').toString().trim().replace(/^@/, '') || null;
    const city = (b.city || '').toString().trim() || null;
    const phone = normalizePhone(b.phone) || null;
    const commission = Math.max(0, Math.min(50, Math.round(Number(b.commission_pct) || DEFAULT_COMMISSION)));
    const payout = ['cash', 'credit'].includes(b.payout_method) ? b.payout_method : 'cash';

    let code = cleanCode(b.code) || affiliateCode();
    if (code === 'HOUSE') return bad('HOUSE is a reserved code.');

    const dup = await env.DB.prepare('SELECT id FROM trainers WHERE email=?').bind(email).first();
    if (dup) return bad('A partner with that email already exists.', 409);

    const tid = id('tr');
    const insert = (c) => env.DB.prepare(
      'INSERT INTO trainers (id, email, name, gym_name, gym_city, phone, affiliate_code, payout_method, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(tid, email, name, handle ? '@' + handle : null, city, phone, c, payout, 1, t, t).run();
    try {
      await insert(code);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) { code = affiliateCode(); await insert(code); }
      else return bad('Could not create that partner.', 500);
    }

    const live = await ensureAffiliateCode(env, { partnerId: tid, code, commissionPct: commission });
    if (!live) return bad('Partner created, but the code could not be activated — try a different code.', 500);

    const emailed = (b.send_welcome === false) ? false
      : await sendPartnerWelcome(env, request, { name, email, code, commission_pct: commission });

    return json({ ok: true, partner_id: tid, code, commission_pct: commission, emailed });
  }

  // --- Cash vs 1.5x Añejo credit.
  if (op === 'set_payout') {
    const pid = (b.partner_id || '').toString().trim();
    const method = ['cash', 'credit'].includes(b.payout_method) ? b.payout_method : null;
    if (!pid || !method) return bad('Pick a partner and a payout method.');
    const r = await env.DB.prepare('UPDATE trainers SET payout_method=?, updated_at=? WHERE id=?')
      .bind(method, t, pid).run();
    if (!r.meta || r.meta.changes !== 1) return bad('Partner not found.', 404);
    return json({ ok: true });
  }

  // --- Settle everything currently pending for a partner.
  if (op === 'mark_paid') {
    const pid = (b.partner_id || '').toString().trim();
    if (!pid) return bad('Missing partner.');
    const r = await env.DB.prepare(
      "UPDATE rev_share_events SET payout_status='paid' WHERE trainer_id=? AND payout_status='pending'"
    ).bind(pid).run();
    return json({ ok: true, settled: (r.meta && r.meta.changes) || 0 });
  }

  // --- Mint a code by hand. 'campaign' = shareable, no partner, optional limits.
  if (op === 'create_code') {
    const kind = ['campaign', 'customer', 'affiliate'].includes(b.kind) ? b.kind : 'campaign';
    const code = cleanCode(b.code);
    if (!code) return bad('Enter a code.');
    if (code === 'HOUSE') return bad('HOUSE is a reserved code.');

    const pctOff = Math.max(0, Math.min(100, Math.round(Number(b.pct_off) || 0)));
    const pointsMult = Math.max(1, Math.min(10, Number(b.points_mult) || 1));
    const commission = Math.max(0, Math.min(50, Math.round(Number(b.commission_pct) || 0)));
    const maxUses = b.max_uses ? Math.max(1, Math.round(Number(b.max_uses))) : null;
    const days = b.expires_days ? Math.max(1, Math.round(Number(b.expires_days))) : null;
    const expires = days ? t + days * 86400 * 1000 : null;
    const perk = b.perk === 'fit_drink' ? 'fit_drink' : null;
    const note = (b.note || '').toString().trim().slice(0, 200) || 'created in HUB';

    let boundEmail = null, partnerId = null;
    if (kind === 'customer') {
      boundEmail = normalizeEmail(b.bound_email);
      if (!isEmail(boundEmail)) return bad('A customer code needs the email it belongs to.');
    }
    if (kind === 'affiliate') {
      partnerId = (b.partner_id || '').toString().trim();
      if (!partnerId) return bad('An affiliate code needs a partner.');
    }

    const exists = await env.DB.prepare('SELECT code FROM promo_codes WHERE code=?').bind(code).first();
    if (exists) return bad('That code already exists.', 409);

    try {
      await env.DB.prepare(
        `INSERT INTO promo_codes (code, kind, bound_email, partner_id, pct_off, points_mult, perk,
           perk_first_order_only, commission_pct, expires_at, max_uses, status, note, created_at)
         VALUES (?,?,?,?,?,?,?,1,?,?,?,'active',?,?)`
      ).bind(code, kind, boundEmail, partnerId, pctOff, pointsMult, perk, commission, expires, maxUses, note, t).run();
    } catch { return bad('Could not create that code.', 500); }
    return json({ ok: true, code });
  }

  // --- Enable / disable a code.
  if (op === 'set_code_status') {
    const code = cleanCode(b.code);
    const status = ['active', 'disabled'].includes(b.status) ? b.status : null;
    if (!code || !status) return bad('Pick a code and a status.');
    const r = await env.DB.prepare('UPDATE promo_codes SET status=? WHERE code=?').bind(status, code).run();
    if (!r.meta || r.meta.changes !== 1) return bad('Code not found.', 404);
    return json({ ok: true });
  }

  // --- Re-send the onboarding email.
  if (op === 'resend_welcome') {
    const pid = (b.partner_id || '').toString().trim();
    const p = await env.DB.prepare('SELECT id, name, email, affiliate_code FROM trainers WHERE id=?').bind(pid).first();
    if (!p) return bad('Partner not found.', 404);
    const pc = await env.DB.prepare('SELECT commission_pct FROM promo_codes WHERE partner_id=? AND kind=\'affiliate\' LIMIT 1').bind(pid).first();
    const emailed = await sendPartnerWelcome(env, request, {
      name: p.name, email: p.email, code: p.affiliate_code,
      commission_pct: (pc && pc.commission_pct) || DEFAULT_COMMISSION,
    });
    return json({ ok: true, emailed });
  }

  return bad('Unknown action.');
};
