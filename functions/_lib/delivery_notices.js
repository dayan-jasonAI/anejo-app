// Delivery texts for CONTRACT stops — a client account's lunch order. Files under functions/_lib are NOT routed.
//
// WHY THIS EXISTS. Dayan, 2026-09-15, from the road: when he starts navigation the client is told; when he
// is five minutes out, told again; when he finishes one delivery and heads to the next, THAT client is told
// — "and on and on." None of it ever reached DGP. A contract stop is an orders row that contract.js creates
// with no customer_phone, no sms_consent and no customer_email, so notify.js's contactForOrder() found
// nobody and every notice returned in silence — while the driver's screen said "Customer notified."
//
// WHO HEARS. Exactly the people who already receive that order's receipt: whoever sent the morning count,
// and the site's primary contact (contract.js submitHeadcount texts its receipt to those two). De-duplicated,
// so the ordinary case — the contact ordering for themselves — is one text, not two.
//
// CONSENT. These are transactional texts about an order that person placed, to numbers that already get its
// receipt and its six-digit code. STOP is honoured and FAILS CLOSED: a number in campaign_unsubscribes is
// never texted, and if that check cannot run, that number is not texted.
//
// LANGUAGE. Nothing records which language anyone on a roster reads (the count page takes `lang` per request
// and keeps nothing), so every text carries English and Spanish rather than a guess about who reads it.
import { sendSms, sendMms } from './twilio.js';

const STOP_LINE = 'Reply STOP to opt out. / Responda STOP para no recibir mensajes.';

const e164 = (p) => {
  const d = String(p || '').replace(/\D+/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
};

async function smsBlocked(env, phone) {
  const last10 = String(phone || '').replace(/\D+/g, '').slice(-10);
  if (last10.length < 10) return true;
  try {
    // recordUnsubscribe stores phones as bare digits, so a suffix match on the last ten is exact enough.
    const hit = await env.DB.prepare(
      "SELECT 1 AS x FROM campaign_unsubscribes WHERE channel IN ('sms', 'all') AND phone IS NOT NULL AND phone LIKE ? LIMIT 1"
    ).bind('%' + last10).first();
    return !!hit;
  } catch {
    return true;
  }
}

/** Who to text about a contract order, and the location's name. Never throws. */
export async function contractAudience(env, order) {
  const out = { phones: [], site: null };
  if (!env || !env.DB || !order || !order.contract_site_id) return out;
  const raw = [];
  try {
    const ev = await env.DB.prepare(
      'SELECT submitted_by_phone FROM contract_order_events WHERE order_id = ? AND submitted_by_phone IS NOT NULL ORDER BY created_at DESC LIMIT 1'
    ).bind(order.id).first();
    if (ev) raw.push(ev.submitted_by_phone);
  } catch { /* no audit row: the site contact still hears */ }
  try {
    const st = await env.DB.prepare('SELECT name, contact_phone FROM contract_sites WHERE id = ?').bind(order.contract_site_id).first();
    if (st) {
      out.site = st.name || null;
      if (st.contact_phone) raw.push(st.contact_phone);
    }
  } catch { /* ignore */ }
  const seen = new Set();
  for (const p of raw) {
    const e = e164(p);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    if (!(await smsBlocked(env, e))) out.phones.push(e);
  }
  if (!out.site) out.site = String(order.customer_name || '').split('·').pop().trim() || null;
  return out;
}

const minutesOf = (etaText) => {
  const m = String(etaText || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * The text itself. Pure, so the copy can be pinned by tests. A time or a minute count appears ONLY when
 * the caller computed one from a real position — the same rule notify.js keeps for consumer orders.
 */
export function contractStopText(kind, { site, etaText = null, photoUrl = null } = {}) {
  const where = site || 'your office';
  const donde = site || 'su oficina';
  if (kind === 'on_the_way') {
    return [
      `Añejo Catering: today's lunch for ${where} is on the way.${etaText ? ` Estimated arrival around ${etaText}.` : ''} We'll text again when the driver is close.`,
      `Añejo Catering: el almuerzo de hoy para ${donde} va en camino.${etaText ? ` Llegada estimada alrededor de las ${etaText}.` : ''} Le avisaremos cuando el chofer esté cerca.`,
      STOP_LINE,
    ].join('\n\n');
  }
  if (kind === 'approaching') {
    const n = minutesOf(etaText);
    return [
      `Añejo Catering: your driver is ${n ? `about ${n} minute${n === 1 ? '' : 's'}` : 'a few minutes'} away from ${where} with today's lunch.`,
      `Añejo Catering: el chofer está a ${n ? `unos ${n} minuto${n === 1 ? '' : 's'}` : 'pocos minutos'} de ${donde} con el almuerzo de hoy.`,
      STOP_LINE,
    ].join('\n\n');
  }
  return [
    `Añejo Catering: today's lunch was delivered to ${where}.${photoUrl ? ` Photo of the drop-off: ${photoUrl}` : ''}`,
    `Añejo Catering: el almuerzo de hoy fue entregado en ${donde}.${photoUrl ? ` Foto de la entrega: ${photoUrl}` : ''}`,
    STOP_LINE,
  ].join('\n\n');
}

/** Send one contract stop notice to everyone who should hear it. Never throws. */
export async function notifyContractStop(env, order, kind, { etaText = null, photoUrl = null } = {}) {
  const res = { sent: 0, recipients: 0 };
  try {
    const { phones, site } = await contractAudience(env, order);
    res.recipients = phones.length;
    for (const to of phones) {
      if (kind === 'delivered' && photoUrl) {
        // The photo IS the message ("we photograph every delivery so you know exactly what arrived"), so
        // it goes as an attachment; a number that cannot take MMS still gets the link.
        const r = await sendMms(env, { to, body: contractStopText(kind, { site }), mediaUrl: photoUrl });
        if (r && (r.ok || r.noop)) { res.sent += 1; continue; }
        const f = await sendSms(env, { to, body: contractStopText(kind, { site, photoUrl }) });
        if (f && (f.ok || f.noop)) res.sent += 1;
        continue;
      }
      const r = await sendSms(env, { to, body: contractStopText(kind, { site, etaText }) });
      if (r && (r.ok || r.noop)) res.sent += 1;
    }
  } catch { /* a notification must never break the driver's flow */ }
  return res;
}
