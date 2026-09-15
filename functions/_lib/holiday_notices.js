// Holiday notices to contract accounts. Files under functions/_lib are NOT routed.
//
// Dayan's policy, 2026-09-14, printed on the prospect landing page and therefore a promise:
//
//   · Ahead of every US federal holiday we ask whether the program is open that day, so the answer
//     is settled in advance rather than guessed at on the morning.
//   · If Añejo's own kitchen is closed for a holiday it observes, the client is told AT LEAST SEVEN
//     DAYS beforehand. Never as a surprise on the day.
//
// WHICH HOLIDAYS AÑEJO CLOSES FOR IS THE OWNER'S, NOT MINE. `holidays.kitchen_closed` starts EMPTY.
// A default list would put "we are closed on Columbus Day" in front of a client on the strength of a
// guess, and a closure nobody decided is a delivery nobody makes. Until he sets it, the asking half
// runs and the closure half sends nothing.
//
// THE SEVEN DAYS IS A FLOOR, NOT A SETTING. closure_lead_days can be raised but never lowered below
// 7, because the promise is in writing and a setting is not allowed to quietly break it.
//
// Idempotence lives in the database: contract_holiday_notices is UNIQUE on (account, SITE, holiday,
// observed date, kind, CHANNEL) — see 0107 — and the row is written BEFORE the send, so a crash
// mid-send leaves a record rather than a silent repeat. An office manager who gets the same question
// every morning for two weeks stops reading all of them, including the one that says the kitchen is
// shut.
//
// BY SITE, BY CHANNEL (2026-09-15). 0106 keyed that guarantee on the ACCOUNT while this file plans
// per SITE, so DGP's second site would have been swallowed as "already sent" — and the email
// idempotency key omitted the site too, so the provider would have deduplicated Pompano's email
// against Delray's. Both now carry the site. Each notice also goes by text to the site's primary
// roster contact: the person who decides whether a program runs on a holiday is the coordinator who
// sends the count from their phone, not the accounts-payable inbox email falls back to.
import { sendEmail } from './email.js';
import { sendSms } from './twilio.js';
import { id, now } from './hub.js';
import { upcomingObservances, daysUntil, longDay, holidayByKey, OBSERVANCE_KEYS, FEDERAL_HOLIDAYS, EXTRA_OBSERVANCES } from './holidays.js';
import { DOW_NAMES } from './contract.js';

export const NOTICE_KINDS = ['confirm_open', 'kitchen_closed'];
export const CONFIRM_LEAD_DAYS = 14;
export const MIN_CLOSURE_LEAD_DAYS = 7;

const INK = '#1d2b1c', MUTED = '#6b7268', GOLD = '#ae8745', RULE = '#e4ded0';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isEmailish = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/** Owner settings. Malformed values fall back to the safe end; never throws. */
export async function loadHolidaySettings(env) {
  const out = { kitchen_closed: [], confirm_lead_days: CONFIRM_LEAD_DAYS, closure_lead_days: MIN_CLOSURE_LEAD_DAYS, enabled: true, sms_enabled: true, reply_to: null, sender: null };
  if (!env || !env.DB) return out;
  let explicitReply = null;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'holidays.%'").all();
    for (const row of (r && r.results) || []) {
      const k = String(row.key).slice(9);
      if (k === 'kitchen_closed') {
        try {
          const list = JSON.parse(row.value);
          if (Array.isArray(list)) out.kitchen_closed = list.filter((x) => OBSERVANCE_KEYS.includes(x));
        } catch { /* keep empty — an unreadable list must not become a guessed one */ }
      }
      if (k === 'enabled') out.enabled = row.value !== 'false';
      if (k === 'sms_enabled') out.sms_enabled = row.value !== 'false';
      if (k === 'reply_to' && isEmailish(row.value)) explicitReply = String(row.value).trim();
      if (k === 'confirm_lead_days') { const n = Number(row.value); if (Number.isInteger(n) && n >= 3 && n <= 60) out.confirm_lead_days = n; }
      // Raising the floor is the owner's business. Lowering it is not: the seven days is a promise
      // made in writing on the landing page, and a settings row cannot be allowed to break it.
      if (k === 'closure_lead_days') { const n = Number(row.value); if (Number.isInteger(n) && n <= 60) out.closure_lead_days = Math.max(MIN_CLOSURE_LEAD_DAYS, n); }
    }
  } catch { /* defaults */ }
  // WHERE A REPLY LANDS. These emails used to go from noreply@ with no Reply-To, so "a reply is welcome"
  // was a reply into nothing — and DGP's instruction is that whoever sees it first answers. They now go
  // out under the owner's own sender, the one he confirmed in writing in Sales → Settings, and replies
  // land in the mailbox he chose. `holidays.reply_to` overrides it; OWNER_EMAIL is the last resort.
  try {
    const snd = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'sales.sender'").first();
    const v = snd && snd.value ? JSON.parse(snd.value) : null;
    if (v && isEmailish(v.from_email)) out.sender = { name: v.from_name || null, email: String(v.from_email).trim() };
    if (v && isEmailish(v.reply_to)) out.reply_to = String(v.reply_to).trim();
  } catch { /* an unreadable sender setting leaves the default sender, never a guessed one */ }
  if (explicitReply) out.reply_to = explicitReply;
  if (!out.reply_to && isEmailish(env.OWNER_EMAIL)) out.reply_to = String(env.OWNER_EMAIL).trim();
  return out;
}

/** An ops email field may hold several addresses, separated by commas, semicolons or spaces. */
export const splitEmails = (v) => [...new Set(String(v || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(isEmailish))];
const joinNames = (list, and) => (list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`);

const deliversOn = (site, isoDate) => {
  const days = String(site.delivery_days || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!days.length) return false;
  return days.includes(DOW_NAMES[(new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7]);
};

/**
 * WHAT SHOULD GO OUT, and why. Pure apart from the settings read, so the Hub can show the owner the
 * next few weeks of notices before any of them are sent.
 */
export async function planHolidayNotices(env, { atMs = Date.now(), settings } = {}) {
  const s = settings || await loadHolidaySettings(env);
  const plan = [];
  if (!s.enabled) return { ok: true, plan, settings: s, reason: 'Holiday notices are switched off.' };

  const horizon = Math.max(s.confirm_lead_days, s.closure_lead_days) + 1;
  // A federal holiday is always considered; an extra (Christmas Eve, Easter…) only when the kitchen closes for it.
  const holidays = upcomingObservances(atMs, horizon).filter((h) => h.federal || s.kitchen_closed.includes(h.key));
  if (!holidays.length) return { ok: true, plan, settings: s };

  // ONE NOTICE PER DAY, NOT PER HOLIDAY. Christmas Eve and an observed Christmas can be the same Friday
  // (25 December 2027 is a Saturday, so it is observed on the 24th); so can New Year's Eve and an observed
  // New Year's Day. Two messages about one closed Friday is the noise that teaches a client to stop
  // reading them. The day's notice names every holiday on it, under one deterministic key.
  const byDate = new Map();
  for (const h of holidays) { if (!byDate.has(h.observed)) byDate.set(h.observed, []); byDate.get(h.observed).push(h); }
  const days = [...byDate.entries()].map(([date, members]) => {
    const shiftedOne = members.find((m) => m.shifted) || null;
    return {
      date, members,
      key: members.map((m) => m.key).sort().join('+'),
      name: joinNames(orderKeys(members.map((m) => m.key)).map((k) => members.find((m) => m.key === k).name), 'and'),
      shifted: !!shiftedOne,
      actual: shiftedOne ? shiftedOne.date : date,
      shift_key: shiftedOne ? shiftedOne.key : null,
      closed: members.some((m) => s.kitchen_closed.includes(m.key)),
    };
  });

  let sites = [];
  try {
    sites = ((await env.DB.prepare(
      `SELECT st.id, st.account_id, st.name, st.delivery_days, st.ops_email, st.contact_name, st.contact_phone,
              a.name AS account_name, a.billing_email, a.status
         FROM contract_sites st JOIN contract_accounts a ON a.id = st.account_id
        WHERE st.active = 1 AND a.status = 'active'
        ORDER BY a.name, st.name`
    ).all()).results) || [];
  } catch { sites = []; }

  const roster = s.sms_enabled ? await primaryPhones(env) : new Map();

  for (const site of sites) {
    for (const d of days) {
      const away = daysUntil(d.date, atMs);
      if (away < 0) continue;
      // A holiday that lands on a day this site never receives lunch is not their problem, and an
      // email about it is noise that teaches them to ignore the next one.
      if (!deliversOn(site, d.date)) continue;

      const closed = d.closed;
      // When the kitchen is shut, asking "will you be open?" wastes the one email they will read.
      // Tell them instead, and tell them only that.
      const kind = closed ? 'kitchen_closed' : 'confirm_open';
      const lead = closed ? s.closure_lead_days : s.confirm_lead_days;
      if (away > lead) continue;

      const base = {
        account_id: site.account_id, account_name: site.account_name, site_id: site.id, site_name: site.name,
        holiday_key: d.key, holiday_name: d.name, holiday_keys: d.members.map((m) => m.key),
        observed_date: d.date, shifted: d.shifted, actual_date: d.actual, shift_key: d.shift_key,
        kind, days_away: away,
      };
      // An ops email can hold several people (DGP: its accountant and an owner), so whoever sees it first
      // answers. Blank falls back to the billing inbox, never to nobody.
      const opsList = splitEmails(site.ops_email);
      const emailTo = opsList.length ? opsList : splitEmails(site.billing_email);
      plan.push({
        ...base, channel: 'email',
        recipients: emailTo,
        recipient: emailTo.join(', ') || null,
        recipient_is_fallback: !opsList.length && emailTo.length > 0,
      });
      if (s.sms_enabled) {
        // The primary on the roster first; the site's own contact_phone only when nobody is on it yet.
        const person = roster.get(site.id) || (site.contact_phone ? { name: site.contact_name || null, phone: site.contact_phone } : null);
        plan.push({
          ...base, channel: 'sms',
          recipient: person ? person.phone : null,
          recipient_name: person ? person.name : null,
          recipient_is_fallback: !roster.has(site.id) && !!person,
        });
      }
    }
  }
  return { ok: true, plan, settings: s };
}

function body({ kind, holiday_name, observed_date, shifted, actual_date, shift_key, site_name, account_name, multi }) {
  const day = longDay(observed_date);
  const shiftName = shift_key ? ((holidayByKey(shift_key) || {}).name || holiday_name) : holiday_name;
  const shiftLine = shifted
    ? `<p style="margin:0 0 14px;color:${MUTED};font-size:14px">${esc(shiftName)} falls on ${esc(longDay(actual_date))} this year and is observed on ${esc(day)}, which is the delivery day this affects.</p>`
    : '';
  // Several people on one email: say so, so nobody waits for somebody else to answer.
  const anyone = multi ? ' Whoever sees this first can answer.' : '';
  if (kind === 'kitchen_closed') {
    return {
      subject: `Our kitchen is closed ${day} for ${holiday_name}`,
      intro: `Our kitchen will be closed on <b>${esc(day)}</b> for ${esc(holiday_name)}, so there is no lunch delivery to ${esc(site_name)} that day.`,
      shiftLine,
      // Dayan, 2026-09-15: "I always find out the day before." The kitchen closing is the half we already
      // know. What arrives late is the client's office being shut the day after, or the rest of that week,
      // so ask while there is still a week to plan around the answer.
      ask: `Nothing is ordered and nothing is invoiced for that day, so there is nothing you need to do for it. One thing we would like to double check: will your office be closed on any other day that week? A quick reply saves us preparing lunch for a day you are out.${anyone}`,
    };
  }
  return {
    subject: `Will ${account_name} be open on ${day}?`,
    intro: `${esc(holiday_name)} is observed on <b>${esc(day)}</b>. We deliver to ${esc(site_name)} on that weekday, so we wanted to ask in advance rather than guess on the morning.`,
    shiftLine,
    ask: `If you are closed, simply send no count that day. A day with no count is a day with no delivery and nothing to invoice. If you are open and running as normal, send your count as usual and we will be there. A reply either way is welcome.${anyone}`,
  };
}

function html(n) {
  const b = body(n);
  return {
    subject: b.subject,
    html: `<!doctype html><html><body style="margin:0;background:#faf8f3;font-family:Georgia,'Times New Roman',serif;color:${INK}">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
  <div style="letter-spacing:5px;font-size:13px;color:${GOLD};font-weight:bold">AÑEJO</div>
  <hr style="border:0;border-top:1px solid ${RULE};margin:16px 0 22px">
  <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${b.intro}</p>
  ${b.shiftLine}
  <p style="margin:0 0 18px;font-size:16px;line-height:1.55">${esc(b.ask)}</p>
  <hr style="border:0;border-top:1px solid ${RULE};margin:22px 0 14px">
  <p style="margin:0;color:${MUTED};font-size:13px;line-height:1.5">Añejo Catering Co.<br>If anything about that week changes, call us and we will work around it.</p>
</div></body></html>`,
    text: `${b.intro.replace(/<[^>]+>/g, '')}\n\n${b.ask}\n\nAñejo Catering Co.`,
  };
}

/** Each active site's primary roster contact with a phone — the most recently active one wins. */
async function primaryPhones(env) {
  const bySite = new Map();
  try {
    const rows = ((await env.DB.prepare(
      `SELECT site_id, name, phone FROM contract_site_staff
        WHERE active = 1 AND is_primary = 1 AND phone IS NOT NULL AND TRIM(phone) <> ''
        ORDER BY COALESCE(last_used_at, 0) DESC, created_at DESC`
    ).all()).results) || [];
    for (const r of rows) if (!bySite.has(r.site_id)) bySite.set(r.site_id, { name: r.name, phone: r.phone });
  } catch { /* no roster in an early environment — the email still goes */ }
  return bySite;
}

// Short names for a text message. "Birthday of Martin Luther King, Jr." is the statutory name and
// belongs in the email; on a phone screen it pushes the actual question below the fold.
const SMS_NAME = {
  en: {
    new_years_day: "New Year's Day", mlk_day: 'MLK Day', washingtons_birthday: "Presidents' Day", memorial_day: 'Memorial Day',
    juneteenth: 'Juneteenth', independence_day: 'Independence Day', labor_day: 'Labor Day', columbus_day: 'Columbus Day',
    veterans_day: 'Veterans Day', thanksgiving: 'Thanksgiving', christmas_day: 'Christmas',
    new_years_eve: "New Year's Eve", easter: 'Easter', christmas_eve: 'Christmas Eve',
  },
  es: {
    new_years_day: 'Año Nuevo', mlk_day: 'el Día de Martin Luther King Jr.', washingtons_birthday: 'el Día de los Presidentes',
    memorial_day: 'el Memorial Day', juneteenth: 'Juneteenth', independence_day: 'el Día de la Independencia',
    labor_day: 'el Día del Trabajo', columbus_day: 'el Día de Colón', veterans_day: 'el Día de los Veteranos',
    thanksgiving: 'el Día de Acción de Gracias', christmas_day: 'Navidad',
    new_years_eve: 'Fin de Año', easter: 'el Domingo de Pascua', christmas_eve: 'Nochebuena',
  },
};
const ES_DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ES_MON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esDay = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${ES_DOW[d.getUTCDay()]} ${d.getUTCDate()} de ${ES_MON[d.getUTCMonth()]}`; };
const STOP_LINE = 'Reply STOP to opt out. / Responda STOP para no recibir mensajes.';
const isExtra = (k) => EXTRA_OBSERVANCES.some((h) => h.key === k);
// "Christmas Eve and Christmas", never "Christmas and Christmas Eve": the eve reads first.
const orderKeys = (keys) => keys.slice().sort((a, b) => (Number(isExtra(b)) - Number(isExtra(a))) || (a < b ? -1 : 1));
/** Short name for a day's key: one holiday, or several joined by '+'. Null when any part is unknown. */
const shortName = (key, lang = 'en') => {
  const ks = orderKeys(String(key || '').split('+').filter(Boolean));
  if (!ks.length || !ks.every((k) => SMS_NAME[lang][k])) return null;
  return joinNames(ks.map((k) => SMS_NAME[lang][k]), lang === 'es' ? 'y' : 'and');
};

/**
 * The text. BOTH LANGUAGES, ALWAYS: no language preference is stored for anyone on a roster — the
 * lunch-count page takes `lang` per request and keeps nothing — and choosing one from a person's name
 * would be a guess about who they are. Two short paragraphs cost a segment; a guess costs the reader.
 *
 * NEVER ASKS FOR "YES". YES is a START keyword in the inbound webhook and at the carrier, so a
 * coordinator answering "YES we're open" would be processed as an opt-in, not as an answer. The
 * question asks for OPEN / CLOSED (ABIERTO / CERRADO), none of which is a keyword anywhere.
 */
export function smsBody(n) {
  const en = shortName(n.holiday_key, 'en') || n.holiday_name;
  const es = shortName(n.holiday_key, 'es') || n.holiday_name;
  const day = longDay(n.observed_date);
  const dia = esDay(n.observed_date);
  const site = n.site_name;
  if (n.kind === 'kitchen_closed') {
    return [
      `Añejo: our kitchen is closed ${day} for ${en}, so there is no lunch delivery to ${site} that day. No need to send a count, and nothing is billed. Closed any other day that week? Reply and let us know.`,
      `Añejo: nuestra cocina cierra el ${dia} por ${es}, así que no hay entrega de almuerzo a ${site} ese día. No hace falta enviar conteo y no se cobra nada. ¿Cierran algún otro día esa semana? Respondan y avísennos.`,
      STOP_LINE,
    ].join('\n\n');
  }
  // A shifted holiday is the one a person second-guesses — "July 4th is Saturday, why Friday?" — so say it.
  const shiftEn = n.shift_key ? (shortName(n.shift_key, 'en') || en) : en;
  const shiftEs = n.shift_key ? (shortName(n.shift_key, 'es') || es) : es;
  const enWhen = n.shifted ? `${shiftEn} falls on ${longDay(n.actual_date)} and is observed ${day}` : `${en} is ${day}`;
  const esWhen = n.shifted ? `${shiftEs} cae el ${esDay(n.actual_date)} y se observa el ${dia}` : `${es} es el ${dia}`;
  return [
    `Añejo: ${enWhen}. Will ${site} be open? If you are closed, just send no count that day and nothing is ordered or billed. Reply OPEN or CLOSED.`,
    `Añejo: ${esWhen}. ¿${site} abre ese día? Si cierran, no envíen conteo y no se pide ni se cobra nada. Respondan ABIERTO o CERRADO.`,
    STOP_LINE,
  ].join('\n\n');
}

/**
 * Has this number opted out of texts? FAILS CLOSED: if the check itself cannot run, the answer is
 * "do not text". Twilio blocks STOP at the carrier too, but a person who said STOP should not depend
 * on a second system catching what the first one forgot. Returns the reason, or null when clear.
 */
async function smsBlocked(env, phone) {
  const last10 = String(phone || '').replace(/\D+/g, '').slice(-10);
  if (last10.length < 7) return 'not a textable number';
  try {
    // recordUnsubscribe stores phones as bare digits, so a suffix match on the last ten is exact enough.
    const hit = await env.DB.prepare(
      "SELECT 1 AS x FROM campaign_unsubscribes WHERE channel IN ('sms', 'all') AND phone IS NOT NULL AND phone LIKE ? LIMIT 1"
    ).bind('%' + last10).first();
    return hit ? 'opted out of texts (replied STOP)' : null;
  } catch {
    return 'could not confirm opt-out status, so did not text';
  }
}

/**
 * Send what is due. Writes each row BEFORE the send so a crash cannot produce a second message; a notice
 * with no address is recorded as `no_recipient` so it surfaces rather than vanishing. Each channel is its
 * own row with its own outcome — a failed text never hides behind a delivered email.
 */
export async function runHolidayNotices(env, { atMs = Date.now(), settings, limit = 60 } = {}) {
  const { plan, settings: s } = await planHolidayNotices(env, { atMs, settings });
  const blank = () => ({ sent: 0, failed: 0, no_recipient: 0, withheld: 0 });
  const res = { ok: true, considered: plan.length, sent: 0, failed: 0, no_recipient: 0, withheld: 0, already: 0, messages: 0, by_channel: { email: blank(), sms: blank() } };
  // Tallies count LOCATIONS told, not messages: two sites on one email are two sites told. `messages` counts sends.
  const tally = (ch, k, n = 1) => { res[k] += n; res.by_channel[ch][k] += n; };
  const mark = (ids, outcome, reason) => Promise.all(ids.map((rowId) => env.DB.prepare(
    'UPDATE contract_holiday_notices SET outcome = ?, failure_reason = ?, sent_at = ? WHERE id = ?'
  ).bind(outcome, reason || null, outcome === 'sent' ? now() : null, rowId).run()));

  // ONE MESSAGE PER RECIPIENT, NOT PER LOCATION. DGP's two sites share the same two people, and sending per
  // site put two identical emails about one holiday into the same two inboxes. Notices for the same
  // account, day, kind and channel that reach the same recipients become one message naming every location
  // — while each location still gets its own row, so the once-only guarantee stays per site.
  const groups = new Map();
  for (const n of plan.slice(0, limit)) {
    const who = n.channel === 'sms'
      ? String(n.recipient || '').replace(/\D+/g, '').slice(-10)
      : (n.recipients || []).slice().sort().join(',');
    const k = [n.account_id, n.observed_date, n.kind, n.channel, who || `none:${n.site_id}`].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }

  for (const items of groups.values()) {
    const channel = items[0].channel;
    const isSms = channel === 'sms';
    const fresh = [];
    for (const n of items) {
      const rowId = id('hnot');
      try {
        await env.DB.prepare(
          `INSERT INTO contract_holiday_notices (id, account_id, site_id, holiday_key, observed_date, kind, channel,
             recipient_email, recipient_phone, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(rowId, n.account_id, n.site_id, n.holiday_key, n.observed_date, n.kind, channel,
          isSms ? null : (n.recipient || null), isSms ? (n.recipient || null) : null,
          n.recipient ? 'sent' : 'no_recipient', now()).run();
        fresh.push({ n, rowId });
      } catch {
        res.already += 1;            // the unique index did its job for this location, on this channel
      }
    }
    if (!fresh.length) continue;
    const lead = fresh[0].n;
    const ids = fresh.map((f) => f.rowId);
    if (!lead.recipient) { tally(channel, 'no_recipient', ids.length); continue; }
    // The message names only the locations it is actually about this time.
    const msg = { ...lead, site_name: joinNames(fresh.map((f) => f.n.site_name), 'and'), multi: !isSms && (lead.recipients || []).length > 1 };
    try {
      if (isSms) {
        const blocked = await smsBlocked(env, lead.recipient);
        if (blocked) { await mark(ids, 'skipped', blocked); tally('sms', 'withheld', ids.length); continue; }
        const r = await sendSms(env, { to: lead.recipient, body: smsBody(msg) });
        if (r && r.sent) { await mark(ids, 'sent'); tally('sms', 'sent', ids.length); res.messages += 1; }
        else if (r && r.noop) { await mark(ids, 'skipped', 'SMS is not configured (TWILIO_* missing)'); tally('sms', 'withheld', ids.length); }
        else { await mark(ids, 'failed', String((r && r.error) || 'the text was not accepted').slice(0, 300)); tally('sms', 'failed', ids.length); }
        continue;
      }
      const m = html(msg);
      const r = await sendEmail(env, {
        to: lead.recipients, subject: m.subject, html: m.html, text: m.text,
        ...(s.sender ? { from: s.sender.name ? `${String(s.sender.name).replace(/[<>"]/g, '')} <${s.sender.email}>` : s.sender.email } : {}),
        ...(s.reply_to ? { replyTo: s.reply_to } : {}),
        idempotencyKey: `holiday:${lead.account_id}:${fresh.map((f) => f.n.site_id || '').sort().join(',')}:${lead.holiday_key}:${lead.observed_date}:${lead.kind}`,
      });
      if (r && r.skipped) { await mark(ids, 'skipped', String(r.suppressed || 'suppressed')); tally('email', 'withheld', ids.length); }
      else {
        // Sent, but not to everyone: say who was left off and why, on the row the owner reads.
        const partial = r && r.dropped && r.dropped.length ? `not sent to ${r.dropped.map((x) => `${x.email} (${x.reason})`).join(', ')}` : null;
        await mark(ids, 'sent', partial);
        tally('email', 'sent', ids.length); res.messages += 1;
      }
    } catch (e) {
      await mark(ids, 'failed', String((e && e.message) || e).slice(0, 300));
      tally(channel, 'failed', ids.length);
    }
  }
  if (!res.sent && !res.failed && !res.no_recipient && !res.withheld) {
    return { ...res, skipped: plan.length ? 'every notice due has already gone' : 'no holiday notice is due', settings: s };
  }
  return { ...res, settings: s };
}

// Replies. Whole-message only: "closed" is an answer; "closed until 1pm" is a sentence a person
// should read, so it is kept verbatim and NOT rounded to a yes or a no.
const ANSWERS = { OPEN: 'open', ABIERTO: 'open', ABIERTA: 'open', CLOSED: 'closed', CLOSE: 'closed', CERRADO: 'closed', CERRADA: 'closed' };
const CONSENT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'YES', 'UNSTOP', 'HELP', 'INFO']);
const REPLY_WINDOW_MS = 62 * 86400000;   // longest lead the settings allow, plus a day

export function readHolidayAnswer(text) {
  return ANSWERS[String(text || '').replace(/[^A-Za-z]/g, '').toUpperCase()] || null;
}

/**
 * A text from a phone we recently asked about a holiday: record it on that notice, so the owner's
 * holiday view shows the answer without anyone reading the inbox. Returns what was recorded, or
 * null. Never throws, and never replaces the inbox — the webhook still threads the message verbatim.
 *
 * A clear answer is not erased by what follows it: "CLOSED" then "gracias!" keeps `closed` and keeps
 * the text that said so. A later clear answer does replace an earlier one — people change plans.
 */
export async function recordHolidayReply(env, { from, body, atMs = Date.now() } = {}) {
  if (!env || !env.DB) return null;
  const text = String(body || '').trim();
  const last10 = String(from || '').replace(/\D+/g, '').slice(-10);
  if (!text || last10.length < 7) return null;
  if (CONSENT_KEYWORDS.has(text.toUpperCase())) return null;   // consent, not an answer — the webhook handles it
  const yesterday = new Date(atMs - 86400000).toISOString().slice(0, 10);
  let n = null;
  try {
    n = await env.DB.prepare(
      `SELECT id, account_id, site_id, holiday_key, observed_date FROM contract_holiday_notices
        WHERE channel = 'sms' AND outcome = 'sent' AND recipient_phone LIKE ?
          AND observed_date >= ? AND sent_at >= ?
        ORDER BY sent_at DESC LIMIT 1`
    ).bind('%' + last10, yesterday, atMs - REPLY_WINDOW_MS).first();
  } catch { return null; }
  if (!n) return null;
  const answer = readHolidayAnswer(text);
  try {
    await env.DB.prepare(
      `UPDATE contract_holiday_notices
          SET reply_text = CASE WHEN ? IS NOT NULL OR reply_answer IS NULL THEN ? ELSE reply_text END,
              reply_answer = COALESCE(?, reply_answer),
              replied_at = ?
        WHERE id = ?`
    ).bind(answer, text.slice(0, 500), answer, atMs, n.id).run();
  } catch { return null; }
  return { notice_id: n.id, answer, holiday: shortName(n.holiday_key, 'en') || n.holiday_key, observed_date: n.observed_date, site_id: n.site_id };
}

/**
 * For the Hub: the next notices, what has already gone and what came back, and — before the day
 * rather than after it — every site a notice will fail to reach.
 */
export async function holidayOutlook(env, { atMs = Date.now(), days = 90 } = {}) {
  const s = await loadHolidaySettings(env);
  const holidays = upcomingObservances(atMs, days)
    .filter((h) => h.federal || s.kitchen_closed.includes(h.key))
    .map((h) => ({ ...h, kitchen_closed: s.kitchen_closed.includes(h.key) }));
  const { plan } = await planHolidayNotices(env, { atMs, settings: s });
  const mask = (p) => (p ? '•••' + String(p).replace(/\D+/g, '').slice(-4) : null);
  const nameOf = (k) => joinNames(orderKeys(String(k || '').split('+').filter(Boolean)).map((x) => (holidayByKey(x) || {}).name || x), 'and');

  let notices = [];
  try {
    notices = ((await env.DB.prepare(
      `SELECT n.id, n.holiday_key, n.observed_date, n.kind, n.channel, n.outcome, n.failure_reason, n.sent_at,
              n.recipient_email, n.recipient_phone, n.reply_text, n.reply_answer, n.replied_at,
              st.name AS site_name, a.name AS account_name
         FROM contract_holiday_notices n
         LEFT JOIN contract_sites st ON st.id = n.site_id
         LEFT JOIN contract_accounts a ON a.id = n.account_id
        WHERE n.observed_date >= ?
        ORDER BY n.observed_date, a.name, st.name, n.channel`
    ).bind(new Date(atMs - 45 * 86400000).toISOString().slice(0, 10)).all()).results) || [];
  } catch { notices = []; }

  let sites = [];
  try {
    sites = (((await env.DB.prepare(
      `SELECT st.id, st.name, st.ops_email, st.contact_phone, a.name AS account_name, a.billing_email,
              (SELECT COUNT(*) FROM contract_site_staff r
                WHERE r.site_id = st.id AND r.active = 1 AND r.is_primary = 1 AND r.phone IS NOT NULL AND TRIM(r.phone) <> '') AS primaries
         FROM contract_sites st JOIN contract_accounts a ON a.id = st.account_id
        WHERE st.active = 1 AND a.status = 'active' ORDER BY a.name, st.name`
    ).all()).results) || []).map((x) => ({
      site_id: x.id, site_name: x.name, account_name: x.account_name, ops_email: x.ops_email || null,
      email: x.ops_email ? 'site' : (x.billing_email ? 'billing_fallback' : 'none'),
      sms: (x.primaries > 0 || x.contact_phone) ? 'ok' : 'none',
    }));
  } catch { sites = []; }

  return {
    settings: s,
    // Every day the kitchen might close, for the owner's checklist — not only the next 90 days.
    catalog: [...FEDERAL_HOLIDAYS, ...EXTRA_OBSERVANCES].map(({ key, name }) => ({ key, name })),
    holidays,
    due_now: plan.map((p) => ({ ...p, recipient: p.channel === 'sms' ? mask(p.recipient) : p.recipient })),
    missing_recipients: plan.filter((p) => !p.recipient).length,
    closed_list: s.kitchen_closed.map(nameOf),
    notices: notices.map((r) => ({ ...r, recipient_phone: mask(r.recipient_phone), holiday_name: nameOf(r.holiday_key) })),
    sites,
  };
}
