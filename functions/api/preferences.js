// /api/preferences — the grown-up version of an unsubscribe link.
//
//   GET  ?a=<address>            → { email_marketing, sms_marketing } for that address
//   POST { a, email_marketing, sms_marketing } → set both, one save
//
// WHY THIS EXISTS: a one-click unsubscribe is all-or-nothing, so the person who only wanted
// fewer emails leaves the list entirely. Giving them a dial instead of a switch is what keeps
// them reachable. It is also where an SMS opt-IN can happen, which the launch form never
// collected (see migration 0047 — nobody was grandfathered into marketing SMS).
//
// PUBLIC AND UNAUTHENTICATED BY DESIGN — SECURITY TRADE MADE DELIBERATELY:
// The link lives in an email footer, so requiring a login would break it for exactly the people
// who need it most, and a broken opt-out is a CAN-SPAM problem *and* a deliverability problem
// (they hit "spam" instead). Address-only access means someone who guesses an address could
// change another person's marketing preferences. We accept that — it is what /api/unsubscribe
// already accepts — and we contain the blast radius instead:
//   • The response NEVER contains anything but the two toggle states. No name, no phone, no
//     order history, no "we don't know you" — an unknown address gets the same default answer a
//     known one does, so this cannot be used to enumerate who is a customer.
//   • Nothing here can send a message, spend money, or change an order.
//   • Rate-limited per IP so it cannot be scraped at speed.
// The one asymmetry worth naming: turning marketing SMS ON creates express consent, and consent
// forged by a stranger is worth less than consent typed by the person. We record when and from
// where (marketing_sms_consent_at / _src='preference_page') so those opt-ins are identifiable
// and reviewable. If Dayan ever wants stronger proof, the upgrade is a signed token in the link.
import { json, bad, now } from '../_lib/util.js';
import { recordUnsubscribe } from '../_lib/audience.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Phone numbers are stored however the customer typed them ("(561) 555-0100", "+15615550100").
// Strip the punctuation in SQL and compare on the last 10 digits — the same match the audience
// resolver makes in JS.
const BARE_PHONE = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'+','')";
const ORDER_BARE_PHONE = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone,' ',''),'-',''),'(',''),')',''),'+','')";

const lower = (s) => String(s == null ? '' : s).trim().toLowerCase();
const digitsOf = (s) => String(s == null ? '' : s).replace(/[^0-9]/g, '');

/**
 * Classify the ?a= value. Returns null for anything that is neither a plausible email nor a
 * plausible US phone — we refuse rather than run a wildcard query.
 */
function parseAddress(raw) {
  const a = String(raw == null ? '' : raw).trim().slice(0, 200);
  if (!a) return null;
  if (a.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return null;
    return { kind: 'email', raw: a, email: lower(a), last10: null };
  }
  const d = digitsOf(a);
  const last10 = d.length >= 10 ? d.slice(-10) : null;
  if (!last10) return null;
  return { kind: 'phone', raw: a, email: null, last10 };
}

const q = async (env, sql, binds = []) => {
  try { const r = await env.DB.prepare(sql).bind(...binds).all(); return (r && r.results) || []; }
  catch { return []; }
};
const run = async (env, sql, binds = []) => {
  try { await env.DB.prepare(sql).bind(...binds).run(); return true; } catch { return false; }
};

// WHERE clause + bind for matching a person in clients/leads (both carry email + phone).
const personWhere = (a) => (a.kind === 'email'
  ? { sql: 'LOWER(TRIM(email)) = ?', bind: a.email }
  : { sql: `phone IS NOT NULL AND ${BARE_PHONE} LIKE '%' || ?`, bind: a.last10 });

// Same match against `orders`, which names the columns customer_email / customer_phone.
// A guest checkout writes ONLY an orders row — no client, no lead — so for the highest-intent
// audience there is that row is the only place marketing SMS consent can live (migration 0048).
const orderWhere = (a) => (a.kind === 'email'
  ? { sql: 'LOWER(TRIM(customer_email)) = ?', bind: a.email }
  : { sql: `customer_phone IS NOT NULL AND ${ORDER_BARE_PHONE} LIKE '%' || ?`, bind: a.last10 });

/**
 * Current marketing state for an address.
 *
 * The consent COLUMNS are only half the answer: past customers can exist in `orders` alone with
 * no clients/leads row at all (resolveAudience hardcodes their email consent), so an unsubscribe
 * row is the only thing that can suppress them. An opt-out therefore always wins over a column,
 * and an address we have never seen reports the site defaults — email on, SMS off — which is
 * exactly what a brand-new customer's row would say. Same answer either way, no oracle.
 */
async function readPrefs(env, a) {
  const w = personWhere(a);
  let emailOn = true;   // CAN-SPAM: existing business relationship, opt-out available (0047)
  let smsOn = false;    // TCPA: express opt-in only, never inferred

  let found = false;
  for (const table of ['clients', 'leads']) {
    const rows = await q(
      env,
      `SELECT marketing_email_consent AS e, marketing_sms_consent AS s FROM ${table} WHERE ${w.sql} LIMIT 1`,
      [w.bind],
    );
    if (rows.length) { emailOn = rows[0].e !== 0; smsOn = rows[0].s === 1; found = true; break; }
  }

  // Guest checkout: no client, no lead, just an order. If they ticked the marketing-SMS box at
  // checkout (0048) that is a real express opt-in and this page must show it ON — otherwise the
  // switch reads "off" and the next save silently revokes consent they actually gave.
  // Degrades to the default if 0048 has not been applied yet (q() swallows the missing column).
  if (!found) {
    const ow = orderWhere(a);
    const rows = await q(env, `SELECT 1 AS s FROM orders WHERE ${ow.sql} AND marketing_sms_consent = 1 LIMIT 1`, [ow.bind]);
    if (rows.length) smsOn = true;
  }

  // An opt-out is a standing instruction and overrides whatever the column says.
  const unsub = await q(
    env,
    a.kind === 'email'
      ? 'SELECT channel FROM campaign_unsubscribes WHERE LOWER(TRIM(email)) = ?'
      : `SELECT channel FROM campaign_unsubscribes WHERE phone IS NOT NULL AND ${BARE_PHONE} LIKE '%' || ?`,
    [a.kind === 'email' ? a.email : a.last10],
  );
  for (const r of unsub) {
    if (r.channel === 'email' || r.channel === 'all') emailOn = false;
    if (r.channel === 'sms' || r.channel === 'all') smsOn = false;
  }
  return { email_marketing: emailOn, sms_marketing: smsOn };
}

/**
 * Clear the opt-out rows blocking one channel for this address.
 *
 * Two deliberate details:
 *  • A channel='all' row covers both channels, so re-enabling ONE channel demotes it to the other
 *    rather than deleting it — turning email back on must not quietly re-open SMS.
 *  • source='reply_stop' rows are never cleared. A carrier-level STOP is undone by texting START
 *    to that number, not by a web form; pretending otherwise would show a toggle that lies.
 */
async function clearOptOut(env, a, channel) {
  const other = channel === 'email' ? 'sms' : 'email';
  const match = a.kind === 'email'
    ? { sql: 'LOWER(TRIM(email)) = ?', bind: a.email }
    : { sql: `phone IS NOT NULL AND ${BARE_PHONE} LIKE '%' || ?`, bind: a.last10 };
  const keepStop = "(source IS NULL OR source <> 'reply_stop')";
  await run(env, `UPDATE campaign_unsubscribes SET channel = ? WHERE channel = 'all' AND ${match.sql} AND ${keepStop}`, [other, match.bind]);
  await run(env, `DELETE FROM campaign_unsubscribes WHERE channel = ? AND ${match.sql} AND ${keepStop}`, [channel, match.bind]);
}

/** Write the consent columns wherever this person exists as a person. */
async function setColumns(env, a, sets, binds) {
  const w = personWhere(a);
  for (const table of ['clients', 'leads']) {
    await run(env, `UPDATE ${table} SET ${sets} WHERE ${w.sql}`, [...binds, w.bind]);
  }
}

/**
 * Mirror the SMS decision onto the person's `orders` rows (0048).
 *
 * Guest checkouts have no clients/leads row, so without this a guest could tick "text me offers"
 * here and it would land nowhere — the switch says yes and no text ever arrives. Every order row
 * for the address is stamped so the flag survives whichever row a future audience query reads.
 * Email is not mirrored: `orders` has no marketing_email_consent column and none is needed —
 * resolveAudience treats past customers as consenting, and the unsubscribe row is what stops them.
 * Silently a no-op until migration 0048 is applied.
 */
async function setOrderSmsConsent(env, a, on) {
  const ow = orderWhere(a);
  await run(
    env,
    on
      ? `UPDATE orders SET marketing_sms_consent = 1, marketing_sms_consent_at = ?, marketing_sms_consent_src = ? WHERE ${ow.sql}`
      : `UPDATE orders SET marketing_sms_consent = 0 WHERE ${ow.sql}`,
    on ? [now(), 'preference_page', ow.bind] : [ow.bind],
  );
}

export const onRequestGet = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'prefs', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const a = parseAddress(new URL(request.url).searchParams.get('a'));
  if (!a) return bad('That preferences link is missing or malformed. Reply to any Añejo email and we will sort it out by hand.');
  if (!env || !env.DB) return bad('Preferences are temporarily unavailable.', 503);

  const prefs = await readPrefs(env, a);
  // Echo the address back only because the visitor supplied it in the URL — nothing else about
  // the person is returned, by design.
  return json({ ok: true, address: a.raw, ...prefs }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'prefs_save', limit: 12, windowSec: 60 });
  if (limited) return limited;

  let b = {};
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const url = new URL(request.url);
  const a = parseAddress(b.a || b.address || url.searchParams.get('a'));
  if (!a) return bad('That preferences link is missing or malformed. Reply to any Añejo email and we will sort it out by hand.');
  if (!env || !env.DB) return bad('Preferences are temporarily unavailable.', 503);

  const wantEmail = b.email_marketing === true || b.email_marketing === 1;
  const wantSms = b.sms_marketing === true || b.sms_marketing === 1;

  // --- Email (CAN-SPAM) -------------------------------------------------------------------
  if (wantEmail) {
    await clearOptOut(env, a, 'email');
    await setColumns(env, a, 'marketing_email_consent = 1', []);
  } else {
    await setColumns(env, a, 'marketing_email_consent = 0', []);
    // The row matters more than the column: orders-only customers have no column to set.
    await recordUnsubscribe(env, { address: a.raw, channel: 'email', source: 'preference_page', reason: 'preference page' });
  }

  // --- SMS (TCPA) -------------------------------------------------------------------------
  if (wantSms) {
    // Ticking this box IS the express opt-in the launch form never collected, so stamp when and
    // where it happened — that stamp is the evidence if the consent is ever questioned.
    await clearOptOut(env, a, 'sms');
    await setColumns(
      env, a,
      'marketing_sms_consent = 1, marketing_sms_consent_at = ?, marketing_sms_consent_src = ?',
      [now(), 'preference_page'],
    );
    await setOrderSmsConsent(env, a, true);
  } else {
    // Revoking clears the flag but LEAVES _at/_src alone — they are the record of the opt-in that
    // was given, and erasing history is not what "unsubscribe" means.
    await setColumns(env, a, 'marketing_sms_consent = 0', []);
    await setOrderSmsConsent(env, a, false);
    await recordUnsubscribe(env, { address: a.raw, channel: 'sms', source: 'preference_page', reason: 'preference page' });
  }

  // Re-read rather than echo the request: whatever we hand back is what a send would actually do
  // (a reply_stop row, for instance, keeps SMS off no matter what the box said).
  const prefs = await readPrefs(env, a);
  return json({ ok: true, address: a.raw, ...prefs }, 200, { 'Cache-Control': 'no-store' });
};
