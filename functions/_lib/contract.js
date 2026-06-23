// B2B contract-account intake. A site's daily headcount → the day's kitchen order + a ledger
// row for invoicing. Files under _lib are NOT routed. Never throws unexpectedly.
import { id, now, parseJson, toJson } from './hub.js';
import { randToken, isEmail, ctEq, normalizePhone } from './util.js';
import { sendSms } from './twilio.js';

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

// ---- Non-repudiation: device verification, append-only audit, SMS receipts -------------
const OTP_TTL_SEC = 600;                 // verification code lives 10 minutes
const DEVICE_TTL_SEC = 60 * 60 * 24 * 180; // trusted-device cookie: 180 days
const CONF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

function confNo() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  let s = ''; for (const x of b) s += CONF_CHARS[x % CONF_CHARS.length];
  return 'ANJ-' + s;
}
function otpCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  let s = ''; for (const x of b) s += (x % 10); return s;
}
function maskPhone(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.length >= 4 ? '•••• ' + d.slice(-4) : '••••';
}
function etClock(ms) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
}
function cookieMap(header) {
  const out = {};
  String(header || '').split(';').forEach((kv) => {
    const i = kv.indexOf('='); if (i < 0) return;
    out[kv.slice(0, i).trim()] = decodeURIComponent((kv.slice(i + 1).trim()) || '');
  });
  return out;
}
const deviceCookieName = (siteId) => 'aintake_' + String(siteId).replace(/[^a-zA-Z0-9_]/g, '');

async function resolveSite(env, token) {
  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE intake_token = ? AND active = 1').bind(String(token || '')).first().catch(() => null);
  if (!site) return { site: null, account: null };
  const account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(site.account_id).first().catch(() => null);
  return { site, account };
}

// A non-revoked trusted device for this site, read from the request cookies (or null).
async function trustedDevice(env, site, cookieHeader) {
  const tok = cookieMap(cookieHeader)[deviceCookieName(site.id)];
  if (!tok) return null;
  try { return (await env.DB.prepare('SELECT * FROM contract_intake_devices WHERE id = ? AND site_id = ? AND revoked = 0').bind(tok, site.id).first()) || null; }
  catch { return null; }
}

// Append-only audit row. Only ever INSERTed — never updated or deleted. The legal record.
async function writeEvent(env, ev) {
  try {
    await env.DB.prepare(
      `INSERT INTO contract_order_events
         (id, site_id, account_id, service_date, order_id, event, headcount, total_cents, notes,
          submitted_by_name, submitted_by_phone, verified, device_id, confirmation_no, ip, user_agent, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id('coe'), ev.site_id, ev.account_id || null, ev.service_date, ev.order_id || null, ev.event,
      ev.headcount != null ? ev.headcount : null, ev.total_cents != null ? ev.total_cents : null, ev.notes || null,
      ev.name || null, ev.phone || null, ev.verified ? 1 : 0, ev.device_id || null, ev.confirmation_no || null,
      (ev.ip || '').toString().slice(0, 64) || null, (ev.user_agent || '').toString().slice(0, 240) || null, now()
    ).run();
  } catch { /* audit is best-effort; must never block recording the order */ }
}

function receiptBody(lang, r) {
  const amt = '$' + (r.total_cents / 100).toFixed(2);
  if (lang === 'es') {
    return `Añejo Catering ✅ Pedido confirmado\n${r.site} · ${r.weekday} ${r.date}\n${r.count} almuerzos · ${amt}${r.is_rush ? ' (urgente)' : ''}\nPor: ${r.name} · ${r.time}\nConf# ${r.confirmation_no}\n¿Cambios? Deben entrar antes de las ${r.cutoff}.`;
  }
  return `Añejo Catering ✅ Order confirmed\n${r.site} · ${r.weekday} ${r.date}\n${r.count} lunches · ${amt}${r.is_rush ? ' (rush)' : ''}\nBy: ${r.name} · ${r.time}\nConf# ${r.confirmation_no}\nNeed a change? Must be in by ${r.cutoff}.`;
}
function otpBody(lang, code, site) {
  if (lang === 'es') return `Código Añejo: ${code}. Ingrésalo para confirmar el pedido de almuerzo de hoy (${site}). Vence en 10 min. No lo compartas.`;
  return `Añejo code: ${code}. Enter it to confirm today's lunch order for ${site}. Expires in 10 min. Do not share it.`;
}

// Step 1 of verify-device-once: text a single-use code to the office's number (the one on
// file, or — on first use of a site with no number yet — the mobile the contact enters, which
// becomes the site's contact on success). Code is held in KV, single-use, 10-min TTL.
export async function requestIntakeOtp(env, { token, name, phone, lang, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site, account } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  if (account && account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up. Añejo will confirm when ordering is live.' };
  const cleanName = (name || '').toString().trim().slice(0, 80);
  if (!cleanName) return { ok: false, error: 'Please enter your name.' };
  const onFile = normalizePhone(site.contact_phone);
  const dest = onFile || normalizePhone(phone);
  if (!dest) return { ok: false, error: 'Enter the mobile number that should receive your confirmation code.' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const rec = { code: otpCode(), name: cleanName, phone: dest, enrolled: onFile ? 0 : 1, exp: t + OTP_TTL_SEC * 1000, tries: 0 };
  try { if (env.SESSIONS) await env.SESSIONS.put('cintake_otp:' + site.id, JSON.stringify(rec), { expirationTtl: OTP_TTL_SEC }); }
  catch { return { ok: false, error: 'Could not start verification. Please try again.' }; }
  const sms = await sendSms(env, { to: dest, body: otpBody(lang, rec.code, site.name) });
  return { ok: false, needs_verify: true, phone_hint: maskPhone(dest), enrolling: !onFile, sms_sent: !!(sms && sms.sent) };
}

// Step 2: verify the code, register a trusted device, and (if self-enrolled) save the number
// as the site contact. Returns the device token for the cookie + a 'verified' audit row.
export async function verifyIntakeOtp(env, { token, code, ip, userAgent, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid.' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  let rec = null;
  try { const raw = env.SESSIONS && await env.SESSIONS.get('cintake_otp:' + site.id); rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
  if (!rec || rec.exp < t) return { ok: false, error: 'That code expired — request a new one.' };
  if ((rec.tries || 0) >= 5) { try { env.SESSIONS && await env.SESSIONS.delete('cintake_otp:' + site.id); } catch {} return { ok: false, error: 'Too many attempts. Request a new code.' }; }
  const given = (code || '').toString().replace(/[^0-9]/g, '');
  if (given.length !== 6 || !ctEq(given, rec.code)) {
    rec.tries = (rec.tries || 0) + 1;
    try { env.SESSIONS && await env.SESSIONS.put('cintake_otp:' + site.id, JSON.stringify(rec), { expirationTtl: OTP_TTL_SEC }); } catch {}
    return { ok: false, error: 'That code is not right. Try again.', needs_verify: true, phone_hint: maskPhone(rec.phone) };
  }
  try { env.SESSIONS && await env.SESSIONS.delete('cintake_otp:' + site.id); } catch {}
  const devTok = randToken(24);
  try {
    await env.DB.prepare('INSERT INTO contract_intake_devices (id, site_id, account_id, contact_name, phone, created_at, last_used_at, revoked) VALUES (?,?,?,?,?,?,?,0)')
      .bind(devTok, site.id, site.account_id, rec.name || null, rec.phone || null, t, t).run();
  } catch { return { ok: false, error: 'Could not register this device. Please try again.' }; }
  if (rec.enrolled) {
    try { await env.DB.prepare('UPDATE contract_sites SET contact_phone = ?, contact_name = COALESCE(contact_name, ?), updated_at = ? WHERE id = ?').bind(rec.phone, rec.name || null, t, site.id).run(); } catch {}
  }
  await writeEvent(env, { site_id: site.id, account_id: site.account_id, service_date: etToday(t), event: 'verified', name: rec.name, phone: rec.phone, verified: 1, device_id: devTok, ip, user_agent: userAgent });
  return { ok: true, verified: true, device_token: devTok, device_cookie: deviceCookieName(site.id), name: rec.name, phone: rec.phone };
}

// Single entrypoint for the intake page. Enforces verify-device-once, records the order, writes
// the append-only audit trail, and texts the receipt. May return { needs_verify } (show the code
// step) or, on success, set_cookie:{ name, value, maxAge } for the endpoint to set.
export async function processIntake(env, { token, count, notes, name, phone, lang, code, cookieHeader, ip, userAgent, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site, account } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  if (account && account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up. Añejo will confirm when ordering is live.' };

  // Already a trusted device → record immediately.
  const device = await trustedDevice(env, site, cookieHeader);
  if (device) {
    const r = await submitHeadcount(env, { token, count, notes, name: name || device.contact_name, lang, deviceId: device.id, phone: device.phone, verified: true, ip, userAgent, nowMs });
    if (r.ok) { try { await env.DB.prepare('UPDATE contract_intake_devices SET last_used_at = ? WHERE id = ?').bind(now(), device.id).run(); } catch {} }
    return r;
  }

  // Untrusted: a supplied code means "verify then record"; otherwise issue the challenge.
  if (code) {
    const v = await verifyIntakeOtp(env, { token, code, ip, userAgent, nowMs });
    if (!v.ok) return v;
    const r = await submitHeadcount(env, { token, count, notes, name: v.name || name, lang, deviceId: v.device_token, phone: v.phone, verified: true, ip, userAgent, nowMs });
    if (r.ok) r.set_cookie = { name: v.device_cookie, value: v.device_token, maxAge: DEVICE_TTL_SEC };
    return r;
  }

  // First contact: cheaply validate the count BEFORE texting a code (don't burn an SMS on a bad input).
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n < 1 || n > 500) return { ok: false, error: 'Enter a head count between 1 and 500.' };
  const date = etToday(typeof nowMs === 'number' ? nowMs : now());
  const days = String(site.delivery_days || 'mon,tue,wed').split(',').map((d) => d.trim().toLowerCase());
  if (!days.includes(DOW_NAMES[dowMon(date) - 1])) return { ok: false, error: `No delivery is scheduled for ${site.name} today.` };
  return await requestIntakeOtp(env, { token, name, phone, lang, nowMs });
}

// Submit a site's headcount for today. Idempotent per (site, service_date): a re-submit
// updates the count + order. Returns a summary object; { ok:false, error } on a problem.
export async function submitHeadcount(env, { token, count, nowMs, submittedBy, notes, name, phone, lang, deviceId, verified, ip, userAgent, sendReceipt = true } = {}) {
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
  const cleanNotes = (notes || '').toString().trim().slice(0, 400) || null; // allergies / special requests
  const submitter = (name || submittedBy || 'web').toString().trim().slice(0, 80) || 'web';

  // 1) Kitchen order (deterministic id; upsert so re-submits update the count without losing prep state).
  const orderId = `octr_${site.id}_${date}`;
  const prior = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(orderId).first().catch(() => null);
  const items = toJson([{ id: 'contract_lunch', name: item, qty: n }]);
  try {
    await env.DB.prepare(
      `INSERT INTO orders
         (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents,
          status, customer_name, delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
          delivery_lat, delivery_lng, fulfillment_mode, contract_site_id, headcount, is_rush, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         items=excluded.items, subtotal_cents=excluded.subtotal_cents, fee_cents=excluded.fee_cents,
         total_estimate_cents=excluded.total_estimate_cents, customer_name=excluded.customer_name,
         delivery_notes=excluded.delivery_notes, headcount=excluded.headcount, is_rush=excluded.is_rush, updated_at=excluded.updated_at`
    ).bind(
      orderId, items, date, site.delivery_window || 'lunch', subtotal, deliveryFee + rushFee, total,
      shortName, site.street || null, site.unit || null, site.city || null, site.state || null, site.zip || null, cleanNotes,
      site.delivery_lat != null ? site.delivery_lat : null, site.delivery_lng != null ? site.delivery_lng : null,
      site.id, n, isRush ? 1 : 0, t, t
    ).run();
  } catch (e) { return { ok: false, error: 'Could not record the order. Please try again.' }; }

  // 2) Ledger row (source of truth for invoicing; one per site per day).
  try {
    await env.DB.prepare(
      `INSERT INTO contract_orders
         (id, site_id, account_id, service_date, headcount, item_name, price_per_lunch_cents,
          delivery_fee_cents, rush_fee_cents, total_cents, order_id, submitted_by, is_rush, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(site_id, service_date) DO UPDATE SET
         headcount=excluded.headcount, item_name=excluded.item_name, delivery_fee_cents=excluded.delivery_fee_cents,
         rush_fee_cents=excluded.rush_fee_cents, total_cents=excluded.total_cents, order_id=excluded.order_id,
         submitted_by=excluded.submitted_by, is_rush=excluded.is_rush, notes=excluded.notes, updated_at=excluded.updated_at`
    ).bind(
      id('cord'), site.id, account.id, date, n, item, pricePer, deliveryFee, rushFee, total,
      orderId, submitter, isRush ? 1 : 0, cleanNotes, t, t
    ).run();
  } catch { /* order already recorded; ledger is best-effort but log-worthy */ }

  // 3) Append-only audit trail + receipt. The confirmation number ties the on-screen result,
  //    the audit row, and the SMS receipt together — non-repudiable proof of this submission.
  const confirmation_no = confNo();
  const weekday = DOW_LABEL[dow - 1];
  await writeEvent(env, {
    site_id: site.id, account_id: account.id, service_date: date, order_id: orderId,
    event: prior ? 'updated' : 'created', headcount: n, total_cents: total, notes: cleanNotes,
    name: submitter, phone: phone || site.contact_phone || null, verified: verified ? 1 : 0,
    device_id: deviceId || null, confirmation_no, ip, user_agent: userAgent,
  });

  let receipt_sent = false;
  const receiptTo = normalizePhone(site.contact_phone) || normalizePhone(phone);
  if (sendReceipt && receiptTo) {
    const sms = await sendSms(env, { to: receiptTo, body: receiptBody(lang, {
      site: site.name, weekday, date, count: n, total_cents: total, is_rush: isRush,
      name: submitter, time: etClock(t), confirmation_no, cutoff: site.cutoff_time || '09:00',
    }) });
    receipt_sent = !!(sms && sms.sent);
  }

  return {
    ok: true, account: account.name, site: site.name, date, weekday,
    count: n, item, price_per_lunch_cents: pricePer, subtotal_cents: subtotal,
    delivery_fee_cents: deliveryFee, rush_fee_cents: rushFee, total_cents: total,
    is_rush: isRush, window: site.window_label || '11:30–12:30', notes: cleanNotes,
    confirmation_no, receipt_sent, receipt_to: receiptTo ? maskPhone(receiptTo) : null,
    updated: !!prior,
  };
}

// This-month history for a site (for the office's running tracker). Returns days + totals.
async function monthFor(env, siteId, date) {
  const prefix = date.slice(0, 7); // YYYY-MM
  let days = [];
  try {
    days = ((await env.DB.prepare(
      'SELECT service_date, headcount, total_cents, is_rush, notes FROM contract_orders WHERE site_id = ? AND service_date LIKE ? ORDER BY service_date ASC'
    ).bind(siteId, prefix + '%').all()).results) || [];
  } catch { days = []; }
  const lunches = days.reduce((s, d) => s + (Number(d.headcount) || 0), 0);
  const total = days.reduce((s, d) => s + (Number(d.total_cents) || 0), 0);
  return { prefix, lunches, total_cents: total, count_days: days.length, days };
}

// Public context for the intake page (site name, date, whether delivery runs today, cutoff
// state, and any count already submitted). Never reveals other sites.
export async function siteContext(env, token, nowMs, opts = {}) {
  if (!env || !env.DB) return { ok: false };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE intake_token = ? AND active = 1').bind(String(token || '')).first().catch(() => null);
  if (!site) return { ok: false, error: 'invalid' };
  const account = await env.DB.prepare('SELECT name FROM contract_accounts WHERE id = ?').bind(site.account_id).first().catch(() => null);
  const device = await trustedDevice(env, site, opts.cookieHeader || '');
  const onFile = normalizePhone(site.contact_phone);
  const date = etToday(t);
  const dow = dowMon(date);
  const days = String(site.delivery_days || '').split(',').map((d) => d.trim().toLowerCase());
  const deliversToday = days.includes(DOW_NAMES[dow - 1]);
  const pastCutoff = etMinutes(t) >= cutoffMin(site.cutoff_time);
  let existing = null;
  try { existing = await env.DB.prepare('SELECT headcount, total_cents, is_rush, notes FROM contract_orders WHERE site_id = ? AND service_date = ?').bind(site.id, date).first(); } catch { /* none */ }
  const month = await monthFor(env, site.id, date);
  return {
    ok: true, account: (account && account.name) || '', site: site.name, date, weekday: DOW_LABEL[dow - 1],
    delivers_today: deliversToday, window: site.window_label || '11:30–12:30',
    cutoff: site.cutoff_time || '09:00', past_cutoff: pastCutoff,
    price_per_lunch_cents: Number(site.price_per_lunch_cents) || 0,
    already: existing ? { count: existing.headcount, total_cents: existing.total_cents, is_rush: !!existing.is_rush, notes: existing.notes || null } : null,
    month,
    // Verification state for the page: a trusted device skips the code step; otherwise we need
    // a number to text the code to (on file, or one the contact enrolls on first use).
    device_trusted: !!device,
    contact_name: (device && device.contact_name) || site.contact_name || null,
    phone_hint: onFile ? maskPhone(onFile) : null,
    has_contact_phone: !!onFile,
    enroll_needed: !device && !onFile,
  };
}

// ---- Owner-side: office contact + trusted-device management + audit trail ----------------
export async function setSiteContact(env, { site_id, contact_name, contact_phone } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const ph = normalizePhone(contact_phone);
  if (contact_phone && !ph) return { ok: false, error: 'Enter a valid mobile number.' };
  try {
    await env.DB.prepare('UPDATE contract_sites SET contact_name = ?, contact_phone = ?, updated_at = ? WHERE id = ?')
      .bind((contact_name || '').toString().trim().slice(0, 80) || null, ph, now(), site_id).run();
    return { ok: true, phone_hint: ph ? maskPhone(ph) : null };
  } catch { return { ok: false, error: 'Could not save the contact.' }; }
}

export async function revokeDevice(env, { device_id } = {}) {
  if (!env || !env.DB) return { ok: false };
  try { await env.DB.prepare('UPDATE contract_intake_devices SET revoked = 1 WHERE id = ?').bind(device_id).run(); return { ok: true }; }
  catch { return { ok: false }; }
}

// Trusted devices for an account's sites (for the owner's "who can order" view).
export async function listDevices(env, accountId) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, site_id, contact_name, phone, created_at, last_used_at, revoked FROM contract_intake_devices WHERE account_id = ? ORDER BY created_at DESC'
    ).bind(accountId).all();
    return (results || []).map((d) => ({ ...d, phone_hint: maskPhone(d.phone) }));
  } catch { return []; }
}

// Recent audit events for an account (the non-repudiation record the owner can show a client).
export async function listEvents(env, accountId, limit = 60) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT site_id, service_date, event, headcount, total_cents, submitted_by_name, verified, confirmation_no, created_at FROM contract_order_events WHERE account_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(accountId, Math.min(200, Number(limit) || 60)).all();
    return results || [];
  } catch { return []; }
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

// Close a period: roll all un-invoiced daily-count rows for an account into one invoice,
// grouped by site + day, and mark them invoiced. from/to optional (default: all un-invoiced).
export async function generateInvoice(env, { accountId, from, to } = {}) {
  if (!env || !env.DB || !accountId) return { ok: false, error: 'Missing account.' };
  const account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(accountId).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };

  let where = 'account_id = ? AND invoiced = 0';
  const binds = [accountId];
  if (from) { where += ' AND service_date >= ?'; binds.push(from); }
  if (to) { where += ' AND service_date <= ?'; binds.push(to); }
  let rows = [];
  try { rows = ((await env.DB.prepare(`SELECT * FROM contract_orders WHERE ${where} ORDER BY service_date ASC`).bind(...binds).all()).results) || []; } catch { rows = []; }
  if (!rows.length) return { ok: false, error: 'Nothing un-invoiced in that period.' };

  let siteNames = {};
  try { for (const s of (((await env.DB.prepare('SELECT id, name FROM contract_sites WHERE account_id = ?').bind(accountId).all()).results) || [])) siteNames[s.id] = s.name; } catch { /* fall back to id */ }

  const bySite = new Map();
  let lunches = 0, subtotal = 0, delivery = 0, rush = 0, total = 0;
  let minD = null, maxD = null;
  for (const r of rows) {
    const sub = (Number(r.headcount) || 0) * (Number(r.price_per_lunch_cents) || 0);
    lunches += Number(r.headcount) || 0; subtotal += sub; delivery += Number(r.delivery_fee_cents) || 0;
    rush += Number(r.rush_fee_cents) || 0; total += Number(r.total_cents) || 0;
    if (!minD || r.service_date < minD) minD = r.service_date;
    if (!maxD || r.service_date > maxD) maxD = r.service_date;
    const key = r.site_id;
    if (!bySite.has(key)) bySite.set(key, { name: siteNames[key] || key, lunches: 0, subtotal_cents: 0, delivery_cents: 0, rush_cents: 0, days: [] });
    const g = bySite.get(key);
    g.lunches += Number(r.headcount) || 0; g.subtotal_cents += sub; g.delivery_cents += Number(r.delivery_fee_cents) || 0; g.rush_cents += Number(r.rush_fee_cents) || 0;
    g.days.push({ date: r.service_date, count: r.headcount, price_cents: r.price_per_lunch_cents, total_cents: r.total_cents, rush: !!r.is_rush });
  }
  const lineItems = { sites: [...bySite.values()] };

  // Per-account sequential invoice number, e.g. DGP-0001.
  let seq = 1;
  try { const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM contract_invoices WHERE account_id = ?').bind(accountId).first(); seq = (Number(c && c.n) || 0) + 1; } catch { /* default 1 */ }
  const number = `${(account.name || 'INV').split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '')}-${String(seq).padStart(4, '0')}`;

  const t = now();
  const invId = id('inv');
  try {
    await env.DB.prepare(
      'INSERT INTO contract_invoices (id, account_id, number, period_from, period_to, lunches, subtotal_cents, delivery_cents, rush_cents, total_cents, line_items, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(invId, accountId, number, minD, maxD, lunches, subtotal, delivery, rush, total, toJson(lineItems), 'open', t, t).run();
  } catch (e) { return { ok: false, error: 'Could not create the invoice.' }; }

  // Mark the rolled-up ledger rows invoiced (so they can't be double-billed).
  try {
    for (const r of rows) await env.DB.prepare('UPDATE contract_orders SET invoiced = 1, invoice_id = ?, updated_at = ? WHERE id = ?').bind(invId, t, r.id).run();
  } catch { /* best-effort; the invoice exists either way */ }

  return { ok: true, invoice_id: invId, number, lunches, subtotal_cents: subtotal, delivery_cents: delivery, rush_cents: rush, total_cents: total, period_from: minD, period_to: maxD };
}

// Full invoice (for the printable page).
export async function getInvoice(env, invId) {
  if (!env || !env.DB) return { ok: false };
  const inv = await env.DB.prepare('SELECT * FROM contract_invoices WHERE id = ?').bind(invId).first().catch(() => null);
  if (!inv) return { ok: false, error: 'not_found' };
  const account = await env.DB.prepare('SELECT name, billing_email, billing_contact FROM contract_accounts WHERE id = ?').bind(inv.account_id).first().catch(() => null);
  return { ok: true, invoice: { ...inv, line_items: parseJson(inv.line_items, { sites: [] }) }, account: account || {} };
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
