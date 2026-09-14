// Scheduled balance reminders for catering quotes.
//
// Dayan, 2026-09-14: reminders on the two days before a balance is due — "don't hint, keep it as
// a surprise."
//
// THE GIFT IS NOT MENTIONED HERE, ANYWHERE, IN EITHER LANGUAGE. A reminder that says "something
// is waiting for you" spends the surprise before the box is opened. This email is a balance
// reminder and nothing else; the cake exists only on the quote page, and only after the balance
// is actually paid. There is a test that fails if a gift word appears in this file.
//
// TWO BEATS, ONCE EACH:
//   · due_soon  — the day BEFORE the balance is due
//   · due_today — the day it is due
//
// Idempotence lives in the database, not here: catering_balance_reminders has UNIQUE(quote_id,
// kind), so a scheduler that runs twice, retries, or overlaps itself cannot send twice. The row
// is written BEFORE the send, so a crash mid-send leaves a record rather than a silent repeat.
import { sendEmail } from './email.js';
import { longDate } from './catering_quote_email.js';
import { createBalanceCheckout } from './catering_balance.js';

const SITE = 'https://anejocateringco.com';
const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INK = '#1d2b1c', MUTED = '#6b7268', GOLD = '#ae8745', RULE = '#e4ded0';

export const REMINDER_KINDS = ['due_soon', 'due_today'];

const COPY = {
  en: {
    subject: (d) => `Your Añejo balance is due ${d}`,
    subjectToday: () => 'Your Añejo balance is due today',
    hello: (n) => (n ? `${n},` : 'Hello,'),
    soon: 'A friendly reminder — the balance on your catering is due tomorrow.',
    today: 'A friendly reminder — the balance on your catering is due today.',
    eventLabel: 'YOUR EVENT',
    owing: 'STILL TO PAY',
    cta: 'Pay the balance',
    reassure: 'Your date is booked and your deposit is received. This is only the remainder.',
    questions: 'Questions, or something to change? Reply to this message — a person reads every one.',
    noLink: 'Reply to this message and we will send you a payment link.',
  },
  es: {
    subject: (d) => `Su saldo de Añejo vence el ${d}`,
    subjectToday: () => 'Su saldo de Añejo vence hoy',
    hello: (n) => (n ? `${n},` : 'Hola,'),
    soon: 'Un recordatorio — el saldo de su catering vence mañana.',
    today: 'Un recordatorio — el saldo de su catering vence hoy.',
    eventLabel: 'SU EVENTO',
    owing: 'PENDIENTE DE PAGO',
    cta: 'Pagar el saldo',
    reassure: 'Su fecha está reservada y su depósito está recibido. Esto es solo el resto.',
    questions: '¿Preguntas, o algo que cambiar? Responda a este mensaje — una persona lee cada uno.',
    noLink: 'Responda a este mensaje y le enviaremos un enlace de pago.',
  },
};

/**
 * The reminder email. Pure — takes values, returns { subject, html, text }. No gift, no upsell,
 * no menu: a person who owes money should be able to read this in five seconds and act.
 */
export function balanceReminderEmail({ kind, customerName, eventDate, balanceCents, dueDate, payUrl, lang } = {}) {
  const L = lang === 'es' ? 'es' : 'en';
  const c = COPY[L];
  const first = String(customerName || '').trim().split(/\s+/)[0] || '';
  const today = kind === 'due_today';
  const subject = today ? c.subjectToday() : c.subject(longDate(dueDate, L) || dueDate || '');

  const html = `<div style="margin:0;padding:24px 16px;background:#f6f2e7">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf8;border-radius:10px">
  <tr><td style="padding:26px 26px 0">
    <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:15px;letter-spacing:3px;color:${GOLD}">AÑEJO</p>
    <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:18px;color:${INK}">${esc(c.hello(first))}</p>
    <p style="margin:0 0 20px;font-family:Georgia,serif;font-size:15px;line-height:1.6;color:${INK}">${esc(today ? c.today : c.soon)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="border-collapse:collapse;background:#f6f2e7;border-radius:8px;margin:0 0 22px">
      <tr><td style="padding:16px 18px">
        <p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;color:${MUTED}">${esc(c.eventLabel)}</p>
        <p style="margin:0 0 12px;font-family:Georgia,serif;font-size:15px;color:${INK}">${esc(longDate(eventDate, L) || eventDate || '')}</p>
        <p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;color:${MUTED}">${esc(c.owing)}</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:26px;color:${INK}">${money(balanceCents)}</p>
      </td></tr>
    </table>

    ${payUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px">
           <tr><td align="center" bgcolor="${GOLD}" style="border-radius:999px">
             <a href="${esc(payUrl)}" style="display:block;padding:15px 22px;font-family:Arial,sans-serif;font-size:15px;color:#fffdf8;text-decoration:none">${esc(c.cta)}</a>
           </td></tr>
         </table>`
      : `<p style="margin:0 0 18px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${MUTED}">${esc(c.noLink)}</p>`}

    <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${MUTED}">${esc(c.reassure)}</p>
    <hr style="border:0;border-top:1px solid ${RULE};margin:0 0 16px">
    <p style="margin:0 0 26px;font-family:Georgia,serif;font-size:13px;line-height:1.6;color:${MUTED}">${esc(c.questions)}</p>
  </td></tr>
</table></div>`;

  const text = [
    c.hello(first),
    '',
    today ? c.today : c.soon,
    '',
    `${c.eventLabel}: ${longDate(eventDate, L) || eventDate || ''}`,
    `${c.owing}: ${money(balanceCents)}`,
    '',
    payUrl ? `${c.cta}: ${payUrl}` : c.noLink,
    '',
    c.reassure,
    c.questions,
  ].join('\n');

  return { subject, html, text };
}

/** YYYY-MM-DD, n days after the given date. Null in, null out — never a guess. */
export function dayOffset(dateStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Which reminder, if any, is due for this quote today.
 *
 * Only ever the day before or the day of. A balance that has slipped past its due date is not
 * chased by this job — an overdue customer needs a person, not a third identical email.
 */
export function reminderDueToday(row, today) {
  if (!row || row.deposit_status !== 'paid' || row.balance_status !== 'due') return null;
  if (!Number.isSafeInteger(row.balance_cents) || row.balance_cents <= 0) return null;
  const due = row.balance_due_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due || ''))) return null;
  if (dayOffset(due, -1) === today) return 'due_soon';
  if (due === today) return 'due_today';
  return null;
}

const uid = () => {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return 'cbr_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/**
 * The scheduled job. Finds every quote owing a balance tomorrow or today, sends each one its
 * reminder once, and returns what it did.
 *
 * Never throws: a scheduler that dies on one bad row stops reminding everybody else.
 */
export async function runBalanceReminders(env, today, { baseUrl = SITE, dryRun = false } = {}) {
  const out = { ok: true, date: today, considered: 0, sent: [], skipped: [], failed: [] };
  if (!env?.DB) return { ...out, ok: false, error: 'no_db' };

  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT q.id, q.customer_name, q.customer_email, q.event_date, q.balance_cents,
              q.balance_due_date, q.balance_status, q.deposit_status, q.lang,
              (SELECT payment_link_url FROM catering_balance_checkouts WHERE quote_id = q.id) AS balance_payment_link_url
         FROM catering_quotes q
        WHERE q.balance_status = 'due' AND q.deposit_status = 'paid'`
    ).all();
    rows = (r && r.results) || [];
  } catch (e) {
    return { ...out, ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }

  for (const row of rows) {
    const kind = reminderDueToday(row, today);
    if (!kind) continue;
    out.considered++;

    if (!row.customer_email) { out.skipped.push({ quote_id: row.id, kind, why: 'no email address' }); continue; }

    // CLAIM FIRST. The insert is the lock: UNIQUE(quote_id, kind) means a second run — a retry, an
    // overlap, a scheduler firing twice — fails here and sends nothing, rather than sending a
    // duplicate and discovering the clash afterwards.
    if (dryRun) { out.sent.push({ quote_id: row.id, kind, dry_run: true }); continue; }
    let claimed = false;
    try {
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO catering_balance_reminders (id, quote_id, kind, amount_cents, channel, created_at)
         VALUES (?,?,?,?,'email',?)`
      ).bind(uid(), row.id, kind, row.balance_cents, Date.now()).run();
      claimed = (res && res.meta && res.meta.changes) > 0;
    } catch { claimed = false; }
    if (!claimed) { out.skipped.push({ quote_id: row.id, kind, why: 'already sent' }); continue; }

    // A reminder with no way to pay is a worse email than no reminder, so mint the Square link
    // when the quote has not got one yet. Failure here is not fatal: the email still goes and
    // tells her to reply, which is better than silence on the day money is due.
    let payUrl = row.balance_payment_link_url || null;
    if (!payUrl) {
      try {
        const made = await createBalanceCheckout(env, row.id, baseUrl);
        if (made && made.ok && made.url) payUrl = made.url;
      } catch { /* fall through to the reply-to-us copy */ }
    }

    const { subject, html, text } = balanceReminderEmail({
      kind,
      customerName: row.customer_name,
      eventDate: row.event_date,
      balanceCents: row.balance_cents,
      dueDate: row.balance_due_date,
      payUrl,
      lang: row.lang,
    });

    try {
      await sendEmail(env, {
        to: row.customer_email,
        subject, html, text,
        idempotencyKey: `catering-balance-${kind}-${row.id}`,
      });
      await env.DB.prepare('UPDATE catering_balance_reminders SET sent_at = ? WHERE quote_id = ? AND kind = ?')
        .bind(Date.now(), row.id, kind).run();
      out.sent.push({ quote_id: row.id, kind, amount_cents: row.balance_cents, had_link: Boolean(payUrl) });
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200);
      try {
        await env.DB.prepare('UPDATE catering_balance_reminders SET error = ? WHERE quote_id = ? AND kind = ?')
          .bind(msg, row.id, kind).run();
      } catch { /* the claim row stands; it simply carries no error text */ }
      out.failed.push({ quote_id: row.id, kind, error: msg });
    }
  }

  return out;
}
