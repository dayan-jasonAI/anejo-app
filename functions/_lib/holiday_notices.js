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
// Idempotence lives in the database: contract_holiday_notices has UNIQUE(account_id, holiday_key,
// observed_date, kind), and the row is written BEFORE the send, so a crash mid-send leaves a record
// rather than a silent repeat. An office manager who gets the same question every morning for two
// weeks stops reading all of them, including the one that says the kitchen is shut.
import { sendEmail } from './email.js';
import { id, now } from './hub.js';
import { upcomingHolidays, daysUntil, longDay, holidayByKey, HOLIDAY_KEYS } from './holidays.js';
import { DOW_NAMES } from './contract.js';

export const NOTICE_KINDS = ['confirm_open', 'kitchen_closed'];
export const CONFIRM_LEAD_DAYS = 14;
export const MIN_CLOSURE_LEAD_DAYS = 7;

const INK = '#1d2b1c', MUTED = '#6b7268', GOLD = '#ae8745', RULE = '#e4ded0';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Owner settings. Malformed values fall back to the safe end; never throws. */
export async function loadHolidaySettings(env) {
  const out = { kitchen_closed: [], confirm_lead_days: CONFIRM_LEAD_DAYS, closure_lead_days: MIN_CLOSURE_LEAD_DAYS, enabled: true };
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'holidays.%'").all();
    for (const row of (r && r.results) || []) {
      const k = String(row.key).slice(9);
      if (k === 'kitchen_closed') {
        try {
          const list = JSON.parse(row.value);
          if (Array.isArray(list)) out.kitchen_closed = list.filter((x) => HOLIDAY_KEYS.includes(x));
        } catch { /* keep empty — an unreadable list must not become a guessed one */ }
      }
      if (k === 'enabled') out.enabled = row.value !== 'false';
      if (k === 'confirm_lead_days') { const n = Number(row.value); if (Number.isInteger(n) && n >= 3 && n <= 60) out.confirm_lead_days = n; }
      // Raising the floor is the owner's business. Lowering it is not: the seven days is a promise
      // made in writing on the landing page, and a settings row cannot be allowed to break it.
      if (k === 'closure_lead_days') { const n = Number(row.value); if (Number.isInteger(n) && n <= 60) out.closure_lead_days = Math.max(MIN_CLOSURE_LEAD_DAYS, n); }
    }
  } catch { /* defaults */ }
  return out;
}

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
  const holidays = upcomingHolidays(atMs, horizon);
  if (!holidays.length) return { ok: true, plan, settings: s };

  let sites = [];
  try {
    sites = ((await env.DB.prepare(
      `SELECT st.id, st.account_id, st.name, st.delivery_days, st.ops_email, st.contact_name,
              a.name AS account_name, a.billing_email, a.status
         FROM contract_sites st JOIN contract_accounts a ON a.id = st.account_id
        WHERE st.active = 1 AND a.status = 'active'`
    ).all()).results) || [];
  } catch { sites = []; }

  for (const site of sites) {
    for (const h of holidays) {
      const away = daysUntil(h.observed, atMs);
      if (away < 0) continue;
      // A holiday that lands on a day this site never receives lunch is not their problem, and an
      // email about it is noise that teaches them to ignore the next one.
      if (!deliversOn(site, h.observed)) continue;

      const closed = s.kitchen_closed.includes(h.key);
      // When the kitchen is shut, asking "will you be open?" wastes the one email they will read.
      // Tell them instead, and tell them only that.
      const kind = closed ? 'kitchen_closed' : 'confirm_open';
      const lead = closed ? s.closure_lead_days : s.confirm_lead_days;
      if (away > lead) continue;

      plan.push({
        account_id: site.account_id, account_name: site.account_name, site_id: site.id, site_name: site.name,
        holiday_key: h.key, holiday_name: h.name, observed_date: h.observed, shifted: h.shifted, actual_date: h.date,
        kind, days_away: away,
        recipient: site.ops_email || site.billing_email || null,
        recipient_is_fallback: !site.ops_email && !!site.billing_email,
      });
    }
  }
  return { ok: true, plan, settings: s };
}

function body({ kind, holiday_name, observed_date, shifted, actual_date, site_name, account_name }) {
  const day = longDay(observed_date);
  const shiftLine = shifted
    ? `<p style="margin:0 0 14px;color:${MUTED};font-size:14px">${esc(holiday_name)} falls on ${esc(longDay(actual_date))} this year and is observed on ${esc(day)}, which is the delivery day this affects.</p>`
    : '';
  if (kind === 'kitchen_closed') {
    return {
      subject: `Our kitchen is closed on ${day} — ${holiday_name}`,
      intro: `Our kitchen will be closed on <b>${esc(day)}</b> for ${esc(holiday_name)}, so there is no delivery to ${esc(site_name)} that day.`,
      shiftLine,
      ask: 'You do not need to do anything. Send no count for that day and nothing is ordered and nothing is invoiced. Your link works as normal the following service day.',
    };
  }
  return {
    subject: `Will ${account_name} be open on ${day}?`,
    intro: `${esc(holiday_name)} is observed on <b>${esc(day)}</b>. We deliver to ${esc(site_name)} on that weekday, so we wanted to ask in advance rather than guess on the morning.`,
    shiftLine,
    ask: 'If you are closed, simply send no count that day — a day with no count is a day with no delivery and nothing to invoice. If you are open and running as normal, send your count as usual and we will be there. A reply either way is welcome but not needed.',
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

/**
 * Send what is due. Writes the row BEFORE the send so a crash cannot produce a second email; a
 * notice with no address is recorded as `no_recipient` so it surfaces rather than vanishing.
 */
export async function runHolidayNotices(env, { atMs = Date.now(), settings, limit = 50 } = {}) {
  const { plan, settings: s } = await planHolidayNotices(env, { atMs, settings });
  const res = { ok: true, considered: plan.length, sent: 0, failed: 0, no_recipient: 0, already: 0 };
  for (const n of plan.slice(0, limit)) {
    const rowId = id('hnot');
    const t = now();
    try {
      await env.DB.prepare(
        `INSERT INTO contract_holiday_notices (id, account_id, site_id, holiday_key, observed_date, kind, recipient_email, outcome, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(rowId, n.account_id, n.site_id, n.holiday_key, n.observed_date, n.kind, n.recipient || null,
        n.recipient ? 'sent' : 'no_recipient', t).run();
    } catch {
      res.already += 1;            // the unique index did its job: this notice has already gone
      continue;
    }
    if (!n.recipient) { res.no_recipient += 1; continue; }
    const m = html(n);
    try {
      const r = await sendEmail(env, {
        to: n.recipient, subject: m.subject, html: m.html, text: m.text,
        idempotencyKey: `holiday:${n.account_id}:${n.holiday_key}:${n.observed_date}:${n.kind}`,
      });
      if (r && r.skipped) {
        await env.DB.prepare("UPDATE contract_holiday_notices SET outcome='skipped', failure_reason=? WHERE id=?").bind(String(r.suppressed || 'suppressed'), rowId).run();
      } else {
        await env.DB.prepare("UPDATE contract_holiday_notices SET outcome='sent', sent_at=? WHERE id=?").bind(now(), rowId).run();
        res.sent += 1;
      }
    } catch (e) {
      res.failed += 1;
      await env.DB.prepare("UPDATE contract_holiday_notices SET outcome='failed', failure_reason=? WHERE id=?")
        .bind(String((e && e.message) || e).slice(0, 300), rowId).run();
    }
  }
  if (!res.sent && !res.failed && !res.no_recipient) return { ...res, skipped: plan.length ? 'every notice due has already gone' : 'no holiday notice is due', settings: s };
  return { ...res, settings: s };
}

/** For the Hub: the next notices, and anything that will fail for want of an address. */
export async function holidayOutlook(env, { atMs = Date.now(), days = 90 } = {}) {
  const s = await loadHolidaySettings(env);
  const holidays = upcomingHolidays(atMs, days).map((h) => ({ ...h, kitchen_closed: s.kitchen_closed.includes(h.key) }));
  const { plan } = await planHolidayNotices(env, { atMs, settings: s });
  return { settings: s, holidays, due_now: plan, missing_recipients: plan.filter((p) => !p.recipient).length, closed_list: s.kitchen_closed.map((k) => (holidayByKey(k) || {}).name).filter(Boolean) };
}
