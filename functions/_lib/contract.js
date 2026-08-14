// B2B contract-account intake. A site's daily headcount → the day's kitchen order + a ledger
// row for invoicing. Files under _lib are NOT routed. Never throws unexpectedly.
import { id, now, parseJson, toJson } from './hub.js';
import { randToken, isEmail, ctEq, normalizePhone } from './util.js';
import { sendSms } from './twilio.js';
import { square, squareConfigured } from './square.js';

const BILLING_MODELS = ['weekly_autopay', 'biweekly', 'monthly', 'same_day'];
const CADENCE_BY_MODEL = { weekly_autopay: 'weekly', biweekly: 'biweekly', monthly: 'monthly', same_day: 'daily' };

export const DOW_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DOW_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// contract_sites.delivery_days is a CSV of day NAMES ('mon,tue,wed'). It was ALSO being read as a
// CSV of numbers in one place (admin/cutoff-check), where Number('mon') is NaN — so no site ever
// matched and the pre-cutoff reminder never fired for anybody. One parser now, tolerant of both
// shapes, so a stray '1,2,3' from an older row or an integration still resolves instead of
// silently disabling a site's delivery schedule.
//   Accepts: 'mon' | 'Monday' | 'MON' | 1..7 (Mon..Sun) | 0 (Sun, JS getDay convention).
//   Returns: canonical lowercase names, deduped, ordered Mon→Sun. [] when nothing parses.
export function parseDeliveryDays(raw) {
  const out = new Set();
  for (const part of String(raw == null ? '' : raw).split(',')) {
    const s = part.trim().toLowerCase();
    if (!s) continue;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      // 0 = Sunday (JS getDay), 1..7 = Mon..Sun (ISO). Anything else is not a weekday.
      if (n === 0) out.add('sun');
      else if (n >= 1 && n <= 7) out.add(DOW_NAMES[n - 1]);
      continue;
    }
    const hit = DOW_NAMES.find((d) => s === d || s.startsWith(d));
    if (hit) out.add(hit);
  }
  return DOW_NAMES.filter((d) => out.has(d));
}

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

// NO MONEY IN THIS MESSAGE. The office contact who confirms a headcount is not the person who
// approves spending — pricing, delivery and rush fees are between Añejo and the account's
// decision-maker, and reach them on the invoice. A texted dollar total puts a number in front of
// whoever happens to hold that phone.
function receiptBody(lang, r) {
  if (lang === 'es') {
    return `Añejo Catering ✅ Pedido confirmado\n${r.site} · ${r.weekday} ${r.date}\n${r.count} almuerzos${r.is_rush ? ' (urgente)' : ''}\nPor: ${r.name} · ${r.time}\nConf# ${r.confirmation_no}\n¿Cambios? Deben entrar antes de las ${r.cutoff}.`;
  }
  return `Añejo Catering ✅ Order confirmed\n${r.site} · ${r.weekday} ${r.date}\n${r.count} lunches${r.is_rush ? ' (rush)' : ''}\nBy: ${r.name} · ${r.time}\nConf# ${r.confirmation_no}\nNeed a change? Must be in by ${r.cutoff}.`;
}
function otpBody(lang, code, site) {
  if (lang === 'es') return `Código Añejo: ${code}. Ingrésalo para confirmar el pedido de almuerzo de hoy (${site}). Vence en 10 min. No lo compartas.`;
  return `Añejo code: ${code}. Enter it to confirm today's lunch order for ${site}. Expires in 10 min. Do not share it.`;
}

// ---- The site's staff roster: who may order for this site --------------------------------
//
// Before this existed, `contract_sites.contact_phone` was the only number a verification code
// could ever reach. When Pompano's registered contact was out on 2026-08-03, the covering staffer
// typed her own name and her own mobile and the code still went to the absent contact's phone —
// so the office could not order at all and the day went unrecorded. contract_intake_devices had
// always allowed many trusted devices per site; the single enrollment phone was the bottleneck.
// See migrations/0077_contract_site_staff.sql.

/** Authorized staff for a site, primary first. `all:true` also returns removed/pending rows. */
export async function listSiteStaff(env, siteId, { all = false } = {}) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, site_id, name, phone, is_primary, added_by, active, created_at, last_used_at
         FROM contract_site_staff WHERE site_id = ?${all ? '' : ' AND active = 1'}
        ORDER BY is_primary DESC, active DESC, name ASC`
    ).bind(siteId).all();
    return results || [];
  } catch { return []; }
}

/**
 * Add (or re-activate) a person on a site's roster. Idempotent per (site, phone) — the unique
 * index means re-verifying a number that is already known updates it instead of duplicating it,
 * which is what keeps a stand-in from appearing twice after they are approved.
 *
 * `active:false` is how a stand-in is recorded: they ordered, verified by a code to their own
 * phone, and are visible to the owner — but authorization is a deliberate act, not a side effect
 * of having placed one order.
 */
export async function addSiteStaff(env, { site_id, account_id, name, phone, added_by = 'owner', active = true, is_primary = false, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const ph = normalizePhone(phone);
  if (!ph) return { ok: false, error: 'Enter a valid mobile number.' };
  const cleanName = (name || '').toString().trim().slice(0, 80);
  if (!cleanName) return { ok: false, error: 'Enter the person’s name.' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  try {
    await env.DB.prepare(
      `INSERT INTO contract_site_staff (id, site_id, account_id, name, phone, is_primary, added_by, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(site_id, phone) DO UPDATE SET
         name=excluded.name, active=excluded.active, is_primary=excluded.is_primary`
    ).bind(id('cst'), site_id, account_id || null, cleanName, ph, is_primary ? 1 : 0, added_by, active ? 1 : 0, t).run();
    return { ok: true, phone_hint: maskPhone(ph) };
  } catch { return { ok: false, error: 'Could not save that person.' }; }
}

// The sender line exists so an unexplained link from an unknown number does not read as a scam.
// When we genuinely do not know who added them, the sentence drops the subject rather than
// naming the brand twice — the first live invites went out as "Añejo Catering: Añejo added you
// to place the lunch order", which spent the one line that was supposed to carry the WHO.
function inviteBody(lang, { site, link, addedBy }) {
  const who = String(addedBy || '').trim();
  if (lang === 'es') {
    const opener = who ? `${who} te agregó` : 'Te agregamos';
    return `Añejo Catering: ${opener} para pedir los almuerzos de ${site}.\nUsa este enlace cada mañana: ${link}\nTe enviaremos un código de 6 dígitos a este número para confirmar que eres tú.`;
  }
  const opener = who ? `${who} added you` : 'You have been added';
  return `Añejo Catering: ${opener} to place the lunch order for ${site}.\nUse this link each morning: ${link}\nWe'll text a 6-digit code to this number to confirm it's you.`;
}

/**
 * Text a newly-added staffer their ordering link.
 *
 * NOT called from addSiteStaff. Adding a row to a table and sending a message to a client's
 * employee are different kinds of act, and folding the second into the first would mean every
 * future caller of addSiteStaff silently sends a text. The routes send this only when the person
 * doing the adding explicitly asked for it — that tick is the per-send tap, not a default the
 * system takes on their behalf.
 *
 * The link carries the site's intake token, which IS the ordering credential. That is the point:
 * without it the person is authorized and has no way in. It is the same link the office already
 * holds, sent to a number the owner or the primary contact just vouched for.
 *
 * Never throws — a failed text must not unwind an add that already succeeded, or the roster and
 * the message would disagree about whether the person exists.
 */
export async function sendStaffInvite(env, { site, name, phone, addedBy, lang, origin } = {}) {
  try {
    const to = normalizePhone(phone);
    if (!to || !site || !site.intake_token) return { sent: false, reason: 'no_link' };
    const base = String((env && env.APP_BASE_URL) || origin || 'https://anejocateringco.com').replace(/\/+$/, '');
    const link = `${base}/lunch-count?t=${encodeURIComponent(site.intake_token)}`;
    const sms = await sendSms(env, {
      to,
      body: inviteBody(lang, { site: site.name, link, addedBy: addedBy ? String(addedBy).slice(0, 60) : null }),
    });
    return { sent: !!(sms && sms.sent), to_hint: maskPhone(to), name: name || null };
  } catch { return { sent: false, reason: 'error' }; }
}

/** Authorize a pending stand-in, or remove someone. Never deletes — the audit trail needs the row. */
export async function setStaffActive(env, { staff_id, active } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  try {
    const r = await env.DB.prepare('UPDATE contract_site_staff SET active = ?, added_by = CASE WHEN ? = 1 AND added_by = \'stand_in\' THEN \'approved\' ELSE added_by END WHERE id = ?')
      .bind(active ? 1 : 0, active ? 1 : 0, staff_id).run();
    if (!r || !r.meta || r.meta.changes !== 1) return { ok: false, error: 'That person is not on this roster.' };
    return { ok: true };
  } catch { return { ok: false, error: 'Could not update that person.' }; }
}

/**
 * Roster rows shaped for a PUBLIC page: names, masked phones, no full numbers.
 * The intake page has no login — the token is in the URL — so a full number returned to it is
 * readable by anyone the link was forwarded to.
 */
export function maskSiteStaff(rows) {
  return (rows || []).map((s) => ({
    id: s.id, name: s.name, phone_hint: maskPhone(s.phone),
    is_primary: !!s.is_primary, active: !!s.active, added_by: s.added_by || null,
  }));
}

/**
 * Resolve a request to the site's PRIMARY CONTACT, or refuse with a reason.
 *
 * The gate is the TRUSTED DEVICE, not the intake token. The link is meant to be shareable inside
 * an office, so holding it cannot be enough to change who may commit this account to spend. The
 * caller must have completed the 6-digit verification on this device AND the number that device
 * verified against must be the site's registered contact number.
 */
export async function primaryContactDevice(env, token, cookieHeader) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site, account } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  if (account && account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up.' };
  const device = await trustedDevice(env, site, cookieHeader);
  if (!device) return { ok: false, error: 'Confirm a lunch order from this device first — that verifies who you are.' };
  const onFile = normalizePhone(site.contact_phone);
  if (!onFile || normalizePhone(device.phone) !== onFile) {
    return { ok: false, error: 'Only the main contact on file can change who orders for this site.' };
  }
  return { ok: true, site, account, device };
}

/** The active roster row for a phone, or null. Used to tell a known staffer from a stand-in. */
async function staffByPhone(env, siteId, phone) {
  const ph = normalizePhone(phone);
  if (!ph) return null;
  try { return (await env.DB.prepare('SELECT * FROM contract_site_staff WHERE site_id = ? AND phone = ?').bind(siteId, ph).first()) || null; }
  catch { return null; }
}

// Step 1 of verify-device-once: text a single-use code to the person actually placing the order.
//
// THREE WAYS to name a destination, in this order of trust:
//   1. `staff_id` — a person picked from the site's roster. The number is read from the ROSTER
//      ROW, never from the request: a client that could hand us both an id and a phone could
//      point somebody else's name at its own handset.
//   2. `phone` — "I'm covering for them today". A staffer not on the roster enters their own
//      mobile, gets the code there, and orders under their own name. This is the path that was
//      missing, and it is why the Pompano office could not order at all.
//   3. neither — fall back to the site's primary contact on file (the old behaviour, kept so a
//      cached page or an older client still works).
// Code is held in KV, single-use, 10-min TTL. One pending code per site: if two people request
// at the same moment the later request wins, which is the same as before this change.
export async function requestIntakeOtp(env, { token, name, phone, staff_id, lang, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site, account } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  if (account && account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up. Añejo will confirm when ordering is live.' };
  let cleanName = (name || '').toString().trim().slice(0, 80);

  let dest = null;
  let known = null;
  if (staff_id) {
    try { known = await env.DB.prepare('SELECT * FROM contract_site_staff WHERE id = ? AND site_id = ? AND active = 1').bind(String(staff_id), site.id).first(); } catch { known = null; }
    if (!known) return { ok: false, error: 'That person is no longer set up to order for this site. Use “Someone else is covering today”.' };
    dest = normalizePhone(known.phone);
    cleanName = cleanName || known.name;
  } else if (phone) {
    dest = normalizePhone(phone);
    if (!dest) return { ok: false, error: 'Enter a valid mobile number — the code is texted to you.' };
    known = await staffByPhone(env, site.id, dest);
  } else {
    dest = normalizePhone(site.contact_phone);
  }
  if (!cleanName) return { ok: false, error: 'Please enter your name.' };
  if (!dest) return { ok: false, error: 'Enter the mobile number that should receive your confirmation code.' };

  // `enrolled` means "no primary contact on file yet" — this number becomes the site's contact on
  // success. It is NOT set for a stand-in: a covering staffer must never silently replace the
  // office's registered contact, which is who stays copied on every receipt.
  const noPrimaryYet = !normalizePhone(site.contact_phone);
  const t = typeof nowMs === 'number' ? nowMs : now();
  const rec = {
    code: otpCode(), name: cleanName, phone: dest,
    enrolled: noPrimaryYet ? 1 : 0,
    // A person with no ACTIVE roster row is a stand-in: they may order, and the audit trail and
    // the owner's roster both say so.
    stand_in: known && known.active ? 0 : 1,
    exp: t + OTP_TTL_SEC * 1000, tries: 0,
  };
  try { if (env.SESSIONS) await env.SESSIONS.put('cintake_otp:' + site.id, JSON.stringify(rec), { expirationTtl: OTP_TTL_SEC }); }
  catch { return { ok: false, error: 'Could not start verification. Please try again.' }; }
  const sms = await sendSms(env, { to: dest, body: otpBody(lang, rec.code, site.name) });
  return {
    ok: false, needs_verify: true, phone_hint: maskPhone(dest),
    enrolling: noPrimaryYet, stand_in: !!rec.stand_in, sms_sent: !!(sms && sms.sent),
  };
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
    // Only when the site had NO primary contact at all. A stand-in never lands here — see the
    // note on `enrolled` in requestIntakeOtp.
    try { await env.DB.prepare('UPDATE contract_sites SET contact_phone = ?, contact_name = COALESCE(contact_name, ?), updated_at = ? WHERE id = ?').bind(rec.phone, rec.name || null, t, site.id).run(); } catch {}
    await addSiteStaff(env, { site_id: site.id, account_id: site.account_id, name: rec.name, phone: rec.phone, added_by: 'seed', active: true, is_primary: true, nowMs: t });
  } else if (rec.stand_in) {
    // A covering staffer: recorded so the owner and the primary contact can SEE who ordered, but
    // active = 0. Placing one order does not make you authorized — that is a deliberate act by
    // the owner or the site's primary contact (the roster answer this was built to).
    await addSiteStaff(env, { site_id: site.id, account_id: site.account_id, name: rec.name, phone: rec.phone, added_by: 'stand_in', active: false, nowMs: t });
  } else {
    try { await env.DB.prepare('UPDATE contract_site_staff SET last_used_at = ? WHERE site_id = ? AND phone = ?').bind(t, site.id, rec.phone).run(); } catch { /* roster touch is cosmetic */ }
  }
  await writeEvent(env, {
    site_id: site.id, account_id: site.account_id, service_date: etToday(t),
    event: rec.stand_in ? 'verified_stand_in' : 'verified',
    name: rec.name, phone: rec.phone, verified: 1, device_id: devTok, ip, user_agent: userAgent,
  });
  return { ok: true, verified: true, device_token: devTok, device_cookie: deviceCookieName(site.id), name: rec.name, phone: rec.phone, stand_in: !!rec.stand_in };
}

// Single entrypoint for the intake page. Enforces verify-device-once, records the order, writes
// the append-only audit trail, and texts the receipt. May return { needs_verify } (show the code
// step) or, on success, set_cookie:{ name, value, maxAge } for the endpoint to set.
export async function processIntake(env, { token, count, notes, name, phone, staff_id, lang, code, cookieHeader, ip, userAgent, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const { site, account } = await resolveSite(env, token);
  if (!site) return { ok: false, error: 'This link is not valid. Please contact Añejo.' };
  if (account && account.status && account.status !== 'active') return { ok: false, error: 'Your account is being set up. Añejo will confirm when ordering is live.' };

  // Already a trusted device → record immediately.
  //
  // UNLESS THE PERSON SAYS THEY ARE SOMEBODY ELSE. An office shares one computer, so the trusted
  // cookie belongs to the DEVICE, not to whoever is sitting at it. Without this, the covering
  // staffer would type her own name into the registered contact's browser and the order would be
  // filed — with a receipt and an audit row — under the name of a person who was not at work
  // that day. When the request names a different person, the shortcut is skipped and a fresh code
  // goes to that person's own phone: identity beats convenience on the record that gets invoiced.
  const device = await trustedDevice(env, site, cookieHeader);
  let claimsSomeoneElse = false;
  if (device) {
    const devPhone = normalizePhone(device.phone);
    if (staff_id) {
      // Picking your own name out of the roster on your own verified device is not "someone
      // else" — it must not cost you a needless code.
      const picked = await env.DB.prepare('SELECT phone FROM contract_site_staff WHERE id = ? AND site_id = ?').bind(String(staff_id), site.id).first().catch(() => null);
      claimsSomeoneElse = !picked || normalizePhone(picked.phone) !== devPhone;
    } else if (phone && normalizePhone(phone)) {
      claimsSomeoneElse = normalizePhone(phone) !== devPhone;
    }
  }
  if (device && !claimsSomeoneElse) {
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
  const days = parseDeliveryDays(site.delivery_days || 'mon,tue,wed');
  if (!days.includes(DOW_NAMES[dowMon(date) - 1])) return { ok: false, error: `No delivery is scheduled for ${site.name} today.` };
  return await requestIntakeOtp(env, { token, name, phone, staff_id, lang, nowMs });
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
  const days = parseDeliveryDays(site.delivery_days || 'mon,tue,wed');
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

  // RECEIPT GOES TO BOTH THE SUBMITTER AND THE SITE'S PRIMARY CONTACT.
  //
  // It used to go only to site.contact_phone. Now that somebody other than the registered contact
  // can order, that alone is wrong in both directions: the person who actually placed the order
  // would never receive their own confirmation number, and the office's registered contact would
  // have no idea an order went in on their site while they were out. De-duplicated, so the
  // ordinary case — the primary contact ordering for themselves — is still exactly one text.
  let receipt_sent = false;
  const body = receiptBody(lang, {
    site: site.name, weekday, date, count: n, total_cents: total, is_rush: isRush,
    name: submitter, time: etClock(t), confirmation_no, cutoff: site.cutoff_time || '09:00',
  });
  const submitterPhone = normalizePhone(phone);
  const primaryPhone = normalizePhone(site.contact_phone);
  const recipients = [...new Set([submitterPhone, primaryPhone].filter(Boolean))];
  if (sendReceipt) {
    for (const to of recipients) {
      const sms = await sendSms(env, { to, body });
      if (sms && sms.sent) receipt_sent = true;
    }
  }
  // What the SUBMITTER sees on screen is their own number when we have it — telling the covering
  // staffer "receipt texted to ••••3642" when 3642 is the absent contact's phone is a small lie
  // that makes them hunt for a text that went to somebody else's handset.
  const receiptTo = submitterPhone || primaryPhone;

  return {
    ok: true, account: account.name, site: site.name, date, weekday,
    // Money is DELIBERATELY ABSENT from this response. The intake page is public (token in the
    // URL, no login), so anything returned here is readable by anyone holding the link — hiding it
    // in the UI while still sending it just moves the disclosure to the network tab. The amounts
    // are still computed and stored on contract_orders for invoicing; they simply never travel to
    // the office contact.
    count: n, item,
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
  // Counts only — no totals, and no per-day amounts. This feeds the public intake page.
  const lunches = days.reduce((s, d) => s + (Number(d.headcount) || 0), 0);
  const safeDays = days.map((d) => ({
    service_date: d.service_date, headcount: d.headcount, is_rush: !!d.is_rush, notes: d.notes || null,
  }));
  return { prefix, lunches, count_days: safeDays.length, days: safeDays };
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
  // The MAIN CONTACT sees the whole roster, pending stand-ins included — they are the person who
  // approves them, and a list that hides them makes the "Allow" control unreachable. Everyone
  // else sees only who may currently order: this page is public (token in the URL, no login), so
  // the names of people who are NOT authorized are not something to hand to whoever holds the
  // link. `active` is only meaningful to a manager and is only sent to one.
  const canManage = !!(device && normalizePhone(device.phone) && normalizePhone(device.phone) === onFile);
  const staff = await listSiteStaff(env, site.id, { all: canManage });
  const date = etToday(t);
  const dow = dowMon(date);
  const days = parseDeliveryDays(site.delivery_days);
  const deliversToday = days.includes(DOW_NAMES[dow - 1]);
  const pastCutoff = etMinutes(t) >= cutoffMin(site.cutoff_time);
  let existing = null;
  try { existing = await env.DB.prepare('SELECT headcount, total_cents, is_rush, notes FROM contract_orders WHERE site_id = ? AND service_date = ?').bind(site.id, date).first(); } catch { /* none */ }
  const month = await monthFor(env, site.id, date);
  return {
    ok: true, account: (account && account.name) || '', site: site.name, date, weekday: DOW_LABEL[dow - 1],
    delivers_today: deliversToday, window: site.window_label || '11:30–12:30',
    cutoff: site.cutoff_time || '09:00', past_cutoff: pastCutoff,
    // price_per_lunch_cents is intentionally NOT returned — see the note on submitHeadcount.
    already: existing ? { count: existing.headcount, is_rush: !!existing.is_rush, notes: existing.notes || null } : null,
    month,
    // Verification state for the page: a trusted device skips the code step; otherwise we need
    // a number to text the code to (on file, or one the contact enrolls on first use).
    device_trusted: !!device,
    contact_name: (device && device.contact_name) || site.contact_name || null,
    phone_hint: onFile ? maskPhone(onFile) : null,
    has_contact_phone: !!onFile,
    enroll_needed: !device && !onFile,
    // WHO MAY ORDER FOR THIS SITE — the picker that replaces "one registered profile".
    // NAMES AND MASKED PHONES ONLY. This page is public: the token is in the URL and there is no
    // login, so a full number returned here is readable by anyone the link is forwarded to. The
    // client never sends us a number for a roster pick either — requestIntakeOtp reads it from
    // the roster row by id, so an id cannot be pointed at somebody else's handset.
    staff: staff.map((s) => ({
      id: s.id, name: s.name, phone_hint: maskPhone(s.phone), is_primary: !!s.is_primary,
      ...(canManage ? { active: !!s.active, added_by: s.added_by || null } : {}),
    })),
    // Whether this device's own person is allowed to manage the roster from the intake page.
    can_manage_staff: canManage,
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

/**
 * OWNER OVERRIDE — set or correct any site's head count for any service date.
 *
 * On 2026-08-03 Pompano's count arrived as a text message to the owner because the office could
 * not use the form, and there was NO WAY TO ENTER IT: this API could set a contact, revoke a
 * device and raise an invoice, but nothing could write a day's count. The day went unbilled.
 *
 * Differs from submitHeadcount in exactly three ways, each deliberate:
 *   · NO SMS, EVER. This is the owner correcting his own books, not the client confirming an
 *     order. Texting a client "order confirmed" for something they never submitted would be a
 *     confirmation of a thing that did not happen.
 *   · A REASON IS REQUIRED and stored on the audit row. An override with no stated source is
 *     indistinguishable from a typo six weeks later when the invoice is questioned.
 *   · It IGNORES the delivery-day and cutoff rules. Those exist to stop a client ordering into a
 *     day we do not serve; they must not stop the owner recording what was actually delivered.
 * `is_rush` is set explicitly by the caller rather than derived from the clock — recording a
 * lunch after it has been eaten would otherwise mark every backfill as a rush order.
 */
export async function ownerSetHeadcount(env, { site_id, service_date, headcount, reason, notes, by, is_rush = false, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const date = String(service_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Pick a service date (YYYY-MM-DD).' };
  const n = Math.floor(Number(headcount));
  if (!Number.isFinite(n) || n < 0 || n > 500) return { ok: false, error: 'Enter a head count between 0 and 500.' };
  const why = (reason || '').toString().trim().slice(0, 240);
  if (!why) return { ok: false, error: 'Say where this count came from — it goes on the record.' };

  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE id = ?').bind(String(site_id || '')).first().catch(() => null);
  if (!site) return { ok: false, error: 'Site not found.' };
  const account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(site.account_id).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };

  const pricePer = Number(site.price_per_lunch_cents) || 0;
  const deliveryFee = Number(site.delivery_fee_cents) || 0;
  const rushFee = is_rush ? (Number(site.rush_fee_cents) || 0) : 0;
  const subtotal = n * pricePer;
  const total = subtotal + deliveryFee + rushFee;
  const item = await resolveItem(env, account, date);
  const shortName = `${(account.name || 'Contract').split(' ')[0]} · ${site.name}`;
  const cleanNotes = (notes || '').toString().trim().slice(0, 400) || null;
  const orderId = `octr_${site.id}_${date}`;
  const prior = await env.DB.prepare('SELECT id, status FROM orders WHERE id = ?').bind(orderId).first().catch(() => null);

  // A backfilled day has already been cooked and delivered — it must not reappear as outstanding
  // work on the kitchen board or a driver's run. A NEW row for a PAST date lands 'fulfilled';
  // today or later starts 'paid' like any scheduled contract order. An EXISTING row keeps
  // whatever status it already has: this call corrects a number, it does not re-open a day.
  const todayEt = etToday(t);
  const status = prior ? prior.status : (date < todayEt ? 'fulfilled' : 'paid');
  const items = toJson([{ id: 'contract_lunch', name: item, qty: n }]);
  try {
    await env.DB.prepare(
      `INSERT INTO orders
         (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents,
          status, customer_name, delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
          delivery_lat, delivery_lng, fulfillment_mode, contract_site_id, headcount, is_rush, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'scheduled', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         items=excluded.items, subtotal_cents=excluded.subtotal_cents, fee_cents=excluded.fee_cents,
         total_estimate_cents=excluded.total_estimate_cents, delivery_notes=excluded.delivery_notes,
         headcount=excluded.headcount, is_rush=excluded.is_rush, updated_at=excluded.updated_at`
    ).bind(
      orderId, items, date, site.delivery_window || 'lunch', subtotal, deliveryFee + rushFee, total,
      status, shortName, site.street || null, site.unit || null, site.city || null, site.state || null, site.zip || null, cleanNotes,
      site.delivery_lat != null ? site.delivery_lat : null, site.delivery_lng != null ? site.delivery_lng : null,
      site.id, n, is_rush ? 1 : 0, t, t
    ).run();
  } catch { return { ok: false, error: 'Could not write the kitchen order.' }; }

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
      orderId, (by || 'Owner').toString().slice(0, 80), is_rush ? 1 : 0, cleanNotes, t, t
    ).run();
  } catch { return { ok: false, error: 'Could not write the billing ledger.' }; }

  // The audit row is what makes this defensible: a distinct event name, the reason, and the
  // person. `verified: 0` is honest — an override is asserted by the owner, not proven by a code.
  await writeEvent(env, {
    site_id: site.id, account_id: account.id, service_date: date, order_id: orderId,
    event: 'owner_override', headcount: n, total_cents: total,
    notes: cleanNotes ? `${why} · ${cleanNotes}` : why,
    name: (by || 'Owner').toString().slice(0, 80), phone: null, verified: 0,
    confirmation_no: null, ip: null, user_agent: 'owner-hub',
  });

  return { ok: true, site: site.name, service_date: date, headcount: n, total_cents: total, item, order_status: status, created: !prior, sms_sent: false };
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

// Add ONE delivery location to an account that already exists.
//
// registerAccount above only runs at self-signup, so an account that later opened a third clinic
// had no way to get a fourth intake link short of a SQL console — the owner desk could edit sites
// it already had and create none. New terms default to a SIBLING site's rather than to zero: an
// account has one negotiated rate, and defaulting to $0 would silently deliver free lunches until
// someone noticed.
export async function addSite(env, p) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const accountId = String((p && p.account_id) || '').trim();
  if (!accountId) return { ok: false, error: 'Missing account.' };
  const account = await env.DB.prepare('SELECT id, status FROM contract_accounts WHERE id = ?').bind(accountId).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };

  const name = (p.name || '').toString().trim().slice(0, 80);
  const street = (p.street || '').toString().trim().slice(0, 160);
  const city = (p.city || '').toString().trim().slice(0, 80);
  if (!name) return { ok: false, error: 'Give the location a name (e.g. "Boca Raton").' };
  if (!street || !city) return { ok: false, error: 'A delivery location needs a street and a city.' };

  const days = parseDeliveryDays(p.delivery_days || 'mon,tue,wed');
  if (!days.length) return { ok: false, error: 'Pick at least one delivery day.' };

  // Inherit the account's existing commercial terms; explicit values on the request still win.
  let sib = null;
  try {
    sib = await env.DB.prepare(
      'SELECT price_per_lunch_cents, delivery_fee_cents, rush_fee_cents, cutoff_time, window_label, delivery_window FROM contract_sites WHERE account_id = ? ORDER BY created_at ASC'
    ).bind(accountId).first();
  } catch { sib = null; }
  const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : fallback);

  const t = now();
  const tok = randToken(16);
  const siteId = id('site');
  try {
    await env.DB.prepare(
      'INSERT INTO contract_sites (id, account_id, name, street, unit, city, state, zip, delivery_days, window_label, delivery_window, price_per_lunch_cents, delivery_fee_cents, cutoff_time, rush_fee_cents, intake_token, contact_name, contact_phone, active, created_at, updated_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)'
    ).bind(
      siteId, accountId, name, street,
      (p.unit || '').toString().trim().slice(0, 60) || null,
      city,
      ((p.state || 'FL').toString().trim() || 'FL').slice(0, 20),
      (p.zip || '').toString().trim().slice(0, 12),
      days.join(','),
      (p.window_label || (sib && sib.window_label) || '11:30–12:30').toString().trim().slice(0, 40),
      (p.delivery_window === 'dinner' ? 'dinner' : 'lunch'),
      num(p.price_per_lunch_cents, (sib && sib.price_per_lunch_cents) || 0),
      num(p.delivery_fee_cents, (sib && sib.delivery_fee_cents) || 0),
      (p.cutoff_time || (sib && sib.cutoff_time) || '09:00').toString().slice(0, 5),
      num(p.rush_fee_cents, (sib && sib.rush_fee_cents) || 1500),
      tok,
      (p.contact_name || '').toString().trim().slice(0, 80) || null,
      (p.contact_phone || '').toString().trim().slice(0, 30) || null,
      t, t,
    ).run();
  } catch { return { ok: false, error: 'Could not add the location.' }; }

  return { ok: true, site_id: siteId, name, link_path: '/lunch-count?t=' + tok, inherited_terms: !!sib };
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
  // picked_period (migrations/0093) records whether the owner chose this exact from/to range on
  // purpose, vs. the range being whatever was un-invoiced. Fall back to the pre-0093 column list on
  // an older schema — the invoice still has to get created either way.
  try {
    await env.DB.prepare(
      'INSERT INTO contract_invoices (id, account_id, number, period_from, period_to, lunches, subtotal_cents, delivery_cents, rush_cents, total_cents, line_items, status, picked_period, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(invId, accountId, number, minD, maxD, lunches, subtotal, delivery, rush, total, toJson(lineItems), 'open', (from || to) ? 1 : 0, t, t).run();
  } catch {
    try {
      await env.DB.prepare(
        'INSERT INTO contract_invoices (id, account_id, number, period_from, period_to, lunches, subtotal_cents, delivery_cents, rush_cents, total_cents, line_items, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(invId, accountId, number, minD, maxD, lunches, subtotal, delivery, rush, total, toJson(lineItems), 'open', t, t).run();
    } catch (e) { return { ok: false, error: 'Could not create the invoice.' }; }
  }

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

// A real, LIVE Square payment link for a contract invoice — same hosted-checkout mechanism the
// catering deposit already uses (_lib/catering_deposit.js createDepositCheckout), reused rather
// than reinvented. SQUARE_ENV governs sandbox-vs-live for the whole app; nothing here is separate
// from that, so a production deploy makes this real money the moment a client clicks it.
//
// Idempotent from BOTH ends: Square's idempotency_key (the invoice id — stable, one link per
// invoice for its lifetime) means a retried request returns the SAME link rather than minting a
// second Square order, and this function itself short-circuits to the already-stored URL if one
// exists, so repeat clicks on "Get payment link" in the HUB never re-hit Square at all.
export async function createInvoicePaymentLink(env, invId, { baseUrl } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  if (!squareConfigured(env)) return { ok: false, error: 'Square is not configured — no payment link can be created.' };

  const inv = await env.DB.prepare('SELECT * FROM contract_invoices WHERE id = ?').bind(invId).first().catch(() => null);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status === 'void') return { ok: false, error: 'That invoice is void — it cannot be paid.' };
  if (inv.status === 'paid') return { ok: false, error: 'That invoice is already marked paid.' };
  if (inv.payment_link_url) return { ok: true, url: inv.payment_link_url, already: true };

  const account = await env.DB.prepare('SELECT name FROM contract_accounts WHERE id = ?').bind(inv.account_id).first().catch(() => null);
  const total = Math.round(Number(inv.total_cents) || 0);
  if (total <= 0) return { ok: false, error: 'This invoice has no amount due.' };

  const base = (baseUrl || '').replace(/\/$/, '');
  const label = `Invoice ${inv.number || inv.id} — ${account && account.name ? account.name : 'Añejo Catering Co.'}` +
    (inv.period_from ? ` (${inv.period_from} – ${inv.period_to || inv.period_from})` : '');

  const { ok, status, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: inv.id,
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: [{
          name: label.slice(0, 300),
          quantity: '1',
          base_price_money: { amount: total, currency: 'USD' },
        }],
        reference_id: 'contract-invoice',
      },
      checkout_options: {
        redirect_url: base ? `${base}/hub/owner/invoice.html?id=${inv.id}` : undefined,
        ask_for_shipping_address: false,
        allow_tipping: false,
      },
    },
  });

  if (!ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return { ok: false, error: detail || `Square could not create the payment link (${status}).` };
  }
  const pl = (data && data.payment_link) || null;
  const url = pl && (pl.long_url || pl.url);
  if (!url) return { ok: false, error: 'Square did not return a payment link URL.' };

  try {
    await env.DB.prepare(
      'UPDATE contract_invoices SET square_order_id=?, payment_link_id=?, payment_link_url=?, updated_at=? WHERE id=?'
    ).bind(pl.order_id || null, pl.id || null, url, now(), inv.id).run();
  } catch (e) {
    // The link exists in Square but we could not record it — say so plainly rather than handing
    // back a URL nothing will ever reconcile when it's paid (same rule as the deposit checkout).
    return { ok: false, error: 'The payment link was created but could not be saved. Do not send it — try again. ' + String((e && e.message) || '').slice(0, 120) };
  }

  return { ok: true, url, order_id: pl.order_id || null };
}

// A contract invoice's Square payment link was paid → mark it paid automatically. Called from the
// Square webhook the same way markDepositPaid is (_lib/catering_deposit.js) — matched on
// square_order_id, guarded on status != 'paid' so a webhook retry is a no-op. Returns the invoice
// id when THIS call is the one that flipped it, else null.
export async function markContractInvoicePaidBySquareOrder(env, squareOrderId, capturedCents) {
  if (!env || !env.DB || !squareOrderId) return null;
  try {
    const inv = await env.DB
      .prepare("SELECT id, total_cents FROM contract_invoices WHERE square_order_id = ? AND status != 'paid' AND status != 'void' LIMIT 1")
      .bind(squareOrderId).first();
    if (!inv) return null;
    const t = now();
    const ref = Number.isFinite(Number(capturedCents)) && Number(capturedCents) > 0
      ? `Square · $${(Number(capturedCents) / 100).toFixed(2)}` : 'Square';
    const r = await env.DB.prepare(
      "UPDATE contract_invoices SET status='paid', paid_at=?, paid_by=?, paid_ref=?, updated_at=? WHERE id=? AND status != 'paid' AND status != 'void'"
    ).bind(t, 'square_webhook', ref, t, inv.id).run();
    return (r && r.meta && r.meta.changes === 1) ? inv.id : null;
  } catch { return null; }
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
