// /api/hub/owner/leads — owner view over website inquiries (tasting & wholesale forms).
//   GET ?kind=tasting|wholesale  → list of inquiries (newest first, LIMIT 200), with a
//                                  `converted` flag (true if a client already exists for that email).
//   GET ?q=<search>              → filter by name / email / company / interest.
//   POST { action:'convert', id } → onboard the lead as a managed client under the house
//                                  trainer (idempotent by email), so it flows into the CRM.
// Read-mostly; owner-only. The leads table is written by the public /api/leads form.
import { json, bad, id, now, isEmail, normalizePhone } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const emailKey = (e) => (e == null ? '' : String(e)).trim().toLowerCase();

// Mirror getOrCreateHouseTrainer in subscriptions/create.js + customers.js so direct/owner-
// onboarded contacts (no referring trainer) attach to one "house" trainer.
async function getOrCreateHouseTrainer(env) {
  const existing = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
  if (existing) return existing.id;
  const tid = id('tr'), t = now();
  try {
    await env.DB.prepare('INSERT INTO trainers (id, email, name, affiliate_code, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .bind(tid, 'house@anejocateringco.com', 'Añejo (Direct)', 'HOUSE', t, t).run();
    return tid;
  } catch (_) {
    const again = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
    return again ? again.id : tid;
  }
}

async function listLeads(env, kind, q) {
  let sql = 'SELECT id, kind, name, email, phone, company, interest, message, source_lang, sms_consent, created_at FROM leads';
  const where = [], binds = [];
  if (['tasting', 'wholesale', 'launch', 'sms'].includes(kind)) { where.push('kind = ?'); binds.push(kind); }
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR interest LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 200';

  let rows = [];
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all();
    rows = (res && res.results) || [];
  } catch { rows = []; }

  // Which lead emails already have a client row? One pass, so the owner can see what's converted.
  const emails = Array.from(new Set(rows.map((r) => emailKey(r.email)).filter(Boolean)));
  const converted = new Set();
  if (emails.length) {
    try {
      const ph = emails.map(() => '?').join(',');
      const cr = await env.DB.prepare(
        `SELECT LOWER(TRIM(email)) AS k FROM clients WHERE LOWER(TRIM(email)) IN (${ph})`
      ).bind(...emails).all();
      for (const c of (cr && cr.results) || []) converted.add(c.k);
    } catch { /* best-effort */ }
  }

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name || null,
    email: r.email || null,
    phone: r.phone || null,
    company: r.company || null,
    interest: r.interest || null,
    message: r.message || null,
    source_lang: r.source_lang || 'en',
    sms_consent: r.sms_consent ? 1 : 0,
    created_at: r.created_at,
    converted: converted.has(emailKey(r.email)),
  }));
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const kind = (url.searchParams.get('kind') || '').trim();
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const items = await listLeads(env, kind, q);

  // Unfiltered counts for the filter chips (so badges don't change as you filter).
  let counts = { tasting: 0, wholesale: 0, launch: 0, sms: 0, total: 0 };
  try {
    const cr = await env.DB.prepare(
      "SELECT SUM(kind='tasting') AS tasting, SUM(kind='wholesale') AS wholesale, SUM(kind='launch') AS launch, SUM(kind='sms') AS sms, COUNT(*) AS total FROM leads"
    ).first();
    if (cr) counts = { tasting: cr.tasting || 0, wholesale: cr.wholesale || 0, launch: cr.launch || 0, sms: cr.sms || 0, total: cr.total || 0 };
  } catch { /* leave zeros */ }

  return json({ ok: true, items, count: items.length, counts });
};

// POST { action:'convert', id } — onboard a lead as a client (under the house trainer).
// Idempotent by email: an existing client for that email is returned, not duplicated.
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  if ((b && b.action) !== 'convert') return bad('Unknown action.');

  const leadId = (b && b.id ? String(b.id) : '').trim();
  if (!leadId) return bad('Missing lead id.');

  const lead = await env.DB.prepare('SELECT id, name, email, phone, sms_consent FROM leads WHERE id = ?')
    .bind(leadId).first();
  if (!lead) return bad('Lead not found.', 404);

  const email = emailKey(lead.email);
  const name = (lead.name == null ? '' : String(lead.name)).trim().slice(0, 120);
  if (!isEmail(email)) return bad('This inquiry has no valid email to convert.');
  if (!name) return bad('This inquiry has no name to convert.');

  // Already a client? Return it (idempotent).
  let existing = null;
  try {
    existing = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = ? LIMIT 1')
      .bind(email).first();
  } catch { existing = null; }
  if (existing) return json({ ok: true, already: true, client_id: existing.id });

  const houseId = await getOrCreateHouseTrainer(env);
  const cid = id('cl'), t0 = now();
  const phone = normalizePhone(lead.phone);
  const smsConsent = lead.sms_consent ? 1 : 0;
  try {
    await env.DB.prepare(
      'INSERT INTO clients (id, trainer_id, email, name, phone, sms_consent, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(cid, houseId, email, name, phone, smsConsent, 'pending', t0, t0).run();
  } catch (_) {
    const again = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = ? LIMIT 1')
      .bind(email).first();
    if (again) return json({ ok: true, already: true, client_id: again.id });
    return bad('Could not convert this inquiry. Please try again.', 500);
  }

  return json({ ok: true, client_id: cid });
};
