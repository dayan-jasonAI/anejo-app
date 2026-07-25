// Audience resolution + the consent gate every broadcast must pass through.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: transactional consent is not marketing consent.
// `sms_consent` was collected with wording about order and delivery updates. Under the TCPA a
// promotional text needs its own express opt-in ($500–$1,500 per message, per recipient), so
// marketing SMS reads ONLY `marketing_sms_consent` and never falls back to `sms_consent`.
// Email follows CAN-SPAM: an existing business relationship is a lawful basis, provided every
// message carries a working unsubscribe — which is why unsubscribes are checked here, not later.
import { now } from './util.js';

export const SEGMENTS = {
  launch_list: {
    label: 'Launch list (Founding Hundred)',
    why: 'They asked to hear from you when you opened — the warmest and least ambiguous audience.',
  },
  past_customers: { label: 'Past customers', why: 'Anyone with a paid order. Existing business relationship.' },
  subscribers: { label: 'Active subscribers', why: 'Current weekly-plan members.' },
  all: { label: 'Everyone reachable', why: 'The union of the above, de-duplicated by address.' },
};
export const isSegment = (s) => Object.prototype.hasOwnProperty.call(SEGMENTS, s);

const email = (e) => String(e == null ? '' : e).trim().toLowerCase();
const digits = (p) => {
  const d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d ? '+' + d : '';
};

/**
 * Everyone who has opted OUT, by channel. Checked before every send.
 * An unsubscribe is a standing instruction from a customer, so it is stored separately from
 * email_suppressions (bounces/complaints) and must survive anything done to that list.
 */
async function optedOut(env, channel) {
  const out = { emails: new Set(), phones: new Set() };
  try {
    const r = await env.DB.prepare(
      "SELECT email, phone, channel FROM campaign_unsubscribes WHERE channel = ? OR channel = 'all'"
    ).bind(channel).all();
    for (const row of (r && r.results) || []) {
      if (row.email) out.emails.add(email(row.email));
      if (row.phone) out.phones.add(digits(row.phone));
    }
  } catch { /* table absent → treat as none, the per-send suppression check still applies */ }
  return out;
}

/**
 * Resolve a segment to deliverable recipients for a channel.
 * Returns { recipients:[{address,name,source}], skipped:{no_consent,unsubscribed,no_address} }.
 * The skipped counts are surfaced to the owner — a segment that silently shrinks is how people
 * end up believing they messaged an audience they never reached.
 */
export async function resolveAudience(env, { segment, channel = 'email' }) {
  const empty = { recipients: [], skipped: { no_consent: 0, unsubscribed: 0, no_address: 0 } };
  if (!env || !env.DB || !isSegment(segment)) return empty;
  const isSms = channel === 'sms';
  const consentCol = isSms ? 'marketing_sms_consent' : 'marketing_email_consent';

  const rows = [];
  const push = (r, source) => rows.push({ ...r, source });
  const q = async (sql, binds = []) => {
    try { const r = await env.DB.prepare(sql).bind(...binds).all(); return (r && r.results) || []; }
    catch { return []; }
  };

  if (segment === 'launch_list' || segment === 'all') {
    for (const r of await q(
      `SELECT name, email, phone, ${consentCol} AS consent FROM leads WHERE kind='launch'`
    )) push(r, 'launch_list');
  }
  if (segment === 'past_customers' || segment === 'all') {
    for (const r of await q(
      "SELECT customer_name AS name, customer_email AS email, customer_phone AS phone, 1 AS consent " +
      "FROM orders WHERE status IN ('paid','prep','ready','fulfilled') AND customer_email IS NOT NULL GROUP BY LOWER(TRIM(customer_email))"
    )) push(r, 'past_customers');
  }
  if (segment === 'subscribers' || segment === 'all') {
    for (const r of await q(
      `SELECT c.name, c.email, c.phone, c.${consentCol} AS consent FROM clients c
        JOIN subscriptions s ON s.client_id = c.id WHERE s.status IN ('active','paused')`
    )) push(r, 'subscribers');
  }

  // Past customers come from `orders`, which has no marketing-consent column of its own. For SMS
  // that is NOT a licence to text them — look the person up in clients and require the explicit
  // flag; anyone we can't positively confirm is skipped.
  let smsOk = null;
  if (isSms) {
    smsOk = new Set();
    for (const r of await q('SELECT email, phone FROM clients WHERE marketing_sms_consent = 1')) {
      if (r.email) smsOk.add(email(r.email));
      if (r.phone) smsOk.add(digits(r.phone));
    }
    for (const r of await q("SELECT email, phone FROM leads WHERE marketing_sms_consent = 1")) {
      if (r.email) smsOk.add(email(r.email));
      if (r.phone) smsOk.add(digits(r.phone));
    }
  }

  const blocked = await optedOut(env, channel);
  const seen = new Set();
  const recipients = [];
  const skipped = { no_consent: 0, unsubscribed: 0, no_address: 0 };

  for (const r of rows) {
    const address = isSms ? digits(r.phone) : email(r.email);
    if (!address) { skipped.no_address += 1; continue; }
    if (seen.has(address)) continue;                     // de-dupe across segments
    seen.add(address);

    if (isSms) {
      if (!smsOk.has(address) && !smsOk.has(email(r.email))) { skipped.no_consent += 1; continue; }
    } else if (!r.consent) { skipped.no_consent += 1; continue; }

    if (blocked.emails.has(email(r.email)) || blocked.phones.has(address)) { skipped.unsubscribed += 1; continue; }
    recipients.push({ address, name: (r.name || '').toString().trim() || null, source: r.source });
  }
  return { recipients, skipped };
}

/** Record an opt-out. Idempotent enough — duplicates are harmless, a missed one is not. */
export async function recordUnsubscribe(env, { address, channel = 'email', reason, source }) {
  if (!env || !env.DB || !address) return false;
  const isPhone = /^\+?\d[\d\s()-]{6,}$/.test(String(address));
  try {
    await env.DB.prepare(
      'INSERT INTO campaign_unsubscribes (id, email, phone, channel, reason, source, created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(
      'uns_' + Math.random().toString(36).slice(2, 12),
      isPhone ? null : email(address), isPhone ? digits(address) : null,
      channel === 'sms' || channel === 'all' ? channel : 'email',
      (reason || '').toString().slice(0, 200) || null, source || 'link', now(),
    ).run();
    return true;
  } catch { return false; }
}
