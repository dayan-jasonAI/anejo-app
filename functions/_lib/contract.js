// B2B contract-account intake. A site's daily headcount → the day's kitchen order + a ledger
// row for invoicing. Files under _lib are NOT routed. Never throws unexpectedly.
import { id, now, parseJson, toJson } from './hub.js';
import { randToken, isEmail } from './util.js';

const BILLING_MODELS = ['weekly_autopay', 'biweekly', 'monthly', 'same_day'];
const CADENCE_BY_MODEL = { weekly_autopay: 'weekly', biweekly: 'biweekly', monthly: 'monthly', same_day: 'daily' };

const DOW_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DOW_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function etMinutes(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
  return (g('hour') % 24) * 60 + g('minute');
}
// 1=Mon .. 7=Sun for a YYYY-MM-DD (noon-UTC avoids tz rollover).
function dowMon(dateStr) { const d = new Date(dateStr + 'T12:00:00Z').getUTCDay(); return ((d + 6) % 7) + 1; }
function cutoffMin(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '09:00')); return m ? (Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])) : 540; }

// ISO-ish week index for the rotating menu. Anchored so it advances one per calendar week.
function weekIndex(dateStr) { return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000 / 7); }

// Resolve today's lunch item from the weekly rotation, else a sensible default.
async function resolveItem(env, account, dateStr) {
  const dow = dowMon(dateStr);
  try {
    const { results } = await env.DB.prepare('SELECT rotation_week, dow, item_name FROM contract_menu WHERE account_id = ?').bind(account.id).all();
    const rows = results || [];
    if (rows.length) {
      const weeks = [...new Set(rows.map((r) => Number(r.rotation_week) || 1))].sort((a, b) => a - b);
      const wk = weeks[weekIndex(dateStr) % weeks.length];
      const hit = rows.find((r) => Number(r.rotation_week) === wk && Number(r.dow) === dow && r.item_name);
      if (hit) return hit.item_name;
    }
  } catch { /* fall through to default */ }
  const short = (account.name || 'Contract').split(' ')[0];
  return `${short} Lunch — ${DOW_LABEL[dow - 1]}`;
}

// Submit a site's headcount for today. Idempotent per (site, service_date): a re-submit
// updates the count + order. Returns a summary object; { ok:false, error } on a problem.
export async function submitHeadcount(env, { token, count, nowMs, submittedBy } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const t = typeof nowMs === 'number' ? nowMs : now();

  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE intake_token = ? AND active = 1').bind(String(token || '')).first().catch(() => null);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  const account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(site.account_id).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };
  if (account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up. Añejo will confirm when ordering is live.' };

  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n < 1 || n > 500) return { ok: false, error: 'Enter a head count between 1 and 500.' };

  const date = etToday(t);
  const dow = dowMon(date);
  const days = String(site.delivery_days || 'mon,tue,wed').split(',').map((d) => d.trim().toLowerCase());
  if (!days.includes(DOW_NAMES[dow - 1])) {
    return { ok: false, error: `No delivery is scheduled for ${site.name} today.` };
  }

  const isRush = etMinutes(t) >= cutoffMin(site.cutoff_time);
  const rushFee = isRush ? (Number(site.rush_fee_cents) || 0) : 0;
  const pricePer = Number(site.price_per_lunch_cents) || 0;
  const deliveryFee = Number(site.delivery_fee_cents) || 0;
  const subtotal = n * pricePer;
  const total = subtotal + deliveryFee + rushFee;
  const item = await resolveItem(env, account, date);
  const shortName = `${(account.name || 'Contract').split(' ')[0]} · ${site.name}`;

  // 1) Kitchen order (deterministic id; upsert so re-submits update the count without losing prep state).
  const orderId = `octr_${site.id}_${date}`;
  const items = toJson([{ id: 'contract_lunch', name: item, qty: n }]);
  try {
    await env.DB.prepare(
      `INSERT INTO orders
         (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents,
          status, customer_name, delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip,
          delivery_lat, delivery_lng, fulfillment_mode, contract_site_id, headcount, is_rush, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         items=excluded.items, subtotal_cents=excluded.subtotal_cents, fee_cents=excluded.fee_cents,
         total_estimate_cents=excluded.total_estimate_cents, customer_name=excluded.customer_name,
         headcount=excluded.headcount, is_rush=excluded.is_rush, updated_at=excluded.updated_at`
    ).bind(
      orderId, items, date, site.delivery_window || 'lunch', subtotal, deliveryFee + rushFee, total,
      shortName, site.street || null, site.unit || null, site.city || null, site.state || null, site.zip || null,
      site.delivery_lat != null ? site.delivery_lat : null, site.delivery_lng != null ? site.delivery_lng : null,
      site.id, n, isRush ? 1 : 0, t, t
    ).run();
  } catch (e) { return { ok: false, error: 'Could not record the order. Please try again.' }; }

  // 2) Ledger row (source of truth for invoicing; one per site per day).
  try {
    await env.DB.prepare(
      `INSERT INTO contract_orders
         (id, site_id, account_id, service_date, headcount, item_name, price_per_lunch_cents,
          delivery_fee_cents, rush_fee_cents, total_cents, order_id, submitted_by, is_rush, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(site_id, service_date) DO UPDATE SET
         headcount=excluded.headcount, item_name=excluded.item_name, delivery_fee_cents=excluded.delivery_fee_cents,
         rush_fee_cents=excluded.rush_fee_cents, total_cents=excluded.total_cents, order_id=excluded.order_id,
         submitted_by=excluded.submitted_by, is_rush=excluded.is_rush, updated_at=excluded.updated_at`
    ).bind(
      id('cord'), site.id, account.id, date, n, item, pricePer, deliveryFee, rushFee, total,
      orderId, (submittedBy || 'web').toString().slice(0, 80), isRush ? 1 : 0, t, t
    ).run();
  } catch { /* order already recorded; ledger is best-effort but log-worthy */ }

  return {
    ok: true, account: account.name, site: site.name, date, weekday: DOW_LABEL[dow - 1],
    count: n, item, price_per_lunch_cents: pricePer, subtotal_cents: subtotal,
    delivery_fee_cents: deliveryFee, rush_fee_cents: rushFee, total_cents: total,
    is_rush: isRush, window: site.window_label || '11:30–12:30',
  };
}

// Public context for the intake page (site name, date, whether delivery runs today, cutoff
// state, and any count already submitted). Never reveals other sites.
export async function siteContext(env, token, nowMs) {
  if (!env || !env.DB) return { ok: false };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE intake_token = ? AND active = 1').bind(String(token || '')).first().catch(() => null);
  if (!site) return { ok: false, error: 'invalid' };
  const account = await env.DB.prepare('SELECT name FROM contract_accounts WHERE id = ?').bind(site.account_id).first().catch(() => null);
  const date = etToday(t);
  const dow = dowMon(date);
  const days = String(site.delivery_days || '').split(',').map((d) => d.trim().toLowerCase());
  const deliversToday = days.includes(DOW_NAMES[dow - 1]);
  const pastCutoff = etMinutes(t) >= cutoffMin(site.cutoff_time);
  let existing = null;
  try { existing = await env.DB.prepare('SELECT headcount, total_cents, is_rush FROM contract_orders WHERE site_id = ? AND service_date = ?').bind(site.id, date).first(); } catch { /* none */ }
  return {
    ok: true, account: (account && account.name) || '', site: site.name, date, weekday: DOW_LABEL[dow - 1],
    delivers_today: deliversToday, window: site.window_label || '11:30–12:30',
    cutoff: site.cutoff_time || '09:00', past_cutoff: pastCutoff,
    price_per_lunch_cents: Number(site.price_per_lunch_cents) || 0,
    already: existing ? { count: existing.headcount, total_cents: existing.total_cents, is_rush: !!existing.is_rush } : null,
  };
}

// Self-registration: a business signs up + picks a billing model. Creates a PENDING account +
// its sites (intake links minted). Pricing/terms are NOT self-serve — the owner sets them on
// activation. Returns { ok, account_id, sites:[{name, link_path}] } or { ok:false, error }.
export async function registerAccount(env, p) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const company = (p && p.company || '').toString().trim().slice(0, 120);
  const email = (p && p.billing_email || '').toString().trim().slice(0, 160);
  const model = BILLING_MODELS.includes(p && p.billing_model) ? p.billing_model : 'biweekly';
  const sites = Array.isArray(p && p.sites) ? p.sites : [];
  if (!company) return { ok: false, error: 'Please enter your company name.' };
  if (!isEmail(email)) return { ok: false, error: 'Please enter a valid billing email.' };
  const clean = sites.map((s) => ({
    name: (s && s.name || '').toString().trim().slice(0, 80),
    street: (s && s.street || '').toString().trim().slice(0, 160),
    unit: (s && s.unit || '').toString().trim().slice(0, 60) || null,
    city: (s && s.city || '').toString().trim().slice(0, 80),
    state: ((s && s.state || 'FL').toString().trim() || 'FL').slice(0, 20),
    zip: (s && s.zip || '').toString().trim().slice(0, 12),
    delivery_days: (s && s.delivery_days || 'mon,tue,wed').toString().slice(0, 40),
    window_label: (s && s.window_label || '').toString().trim().slice(0, 40) || null,
    contact_name: (s && s.contact_name || '').toString().trim().slice(0, 80) || null,
    contact_phone: (s && s.contact_phone || '').toString().trim().slice(0, 30) || null,
  })).filter((s) => s.name && s.street && s.city);
  if (!clean.length) return { ok: false, error: 'Add at least one delivery location (name, street, city).' };

  const t = now();
  const accId = id('acct');
  try {
    await env.DB.prepare(
      'INSERT INTO contract_accounts (id, name, billing_email, billing_contact, billing_model, invoice_cadence, status, signup_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(accId, company, email, (p && p.billing_contact || '').toString().trim().slice(0, 80) || null, model, CADENCE_BY_MODEL[model] || 'biweekly', 'pending', t, t, t).run();
  } catch (e) { return { ok: false, error: 'Could not create the account. Please try again.' }; }

  const out = [];
  for (const s of clean) {
    const tok = randToken(16);
    try {
      await env.DB.prepare(
        'INSERT INTO contract_sites (id, account_id, name, street, unit, city, state, zip, delivery_days, window_label, delivery_window, price_per_lunch_cents, delivery_fee_cents, cutoff_time, rush_fee_cents, intake_token, contact_name, contact_phone, active, created_at, updated_at) ' +
        "VALUES (?,?,?,?,?,?,?,?,?,?, 'lunch', 0, 0, '09:00', 1500, ?, ?, ?, 1, ?, ?)"
      ).bind(id('site'), accId, s.name, s.street, s.unit, s.city, s.state, s.zip, s.delivery_days, s.window_label || '11:30–12:30', tok, s.contact_name, s.contact_phone, t, t).run();
      out.push({ name: s.name, link_path: '/lunch-count?t=' + tok });
    } catch { /* skip a bad site */ }
  }
  return { ok: true, account_id: accId, company, billing_model: model, sites: out };
}

// Owner activation: set the negotiated terms across an account's sites + flip it active.
export async function activateAccount(env, accountId, terms) {
  if (!env || !env.DB) return { ok: false };
  const price = Math.max(0, Math.round(Number(terms && terms.price_per_lunch_cents) || 0));
  const fee = Math.max(0, Math.round(Number(terms && terms.delivery_fee_cents) || 0));
  const rush = Math.max(0, Math.round(Number(terms && terms.rush_fee_cents) || 1500));
  const cutoff = (terms && terms.cutoff_time || '09:00').toString();
  if (price <= 0) return { ok: false, error: 'Set a price per lunch before activating.' };
  const t = now();
  try {
    await env.DB.prepare('UPDATE contract_sites SET price_per_lunch_cents=?, delivery_fee_cents=?, rush_fee_cents=?, cutoff_time=?, updated_at=? WHERE account_id=?')
      .bind(price, fee, rush, cutoff, t, accountId).run();
    await env.DB.prepare("UPDATE contract_accounts SET status='active', updated_at=? WHERE id=?").bind(t, accountId).run();
  } catch { return { ok: false, error: 'Could not activate.' }; }
  return { ok: true };
}
