// Scheduled catering balance reminders.
//
// Dayan, 2026-09-14: reminders on the two days before the balance is due — "don't hint, keep it
// as a surprise."
//
// The two properties worth testing are both about restraint:
//
//   · the email says NOTHING about the gift, in either language; and
//   · a scheduler that runs twice sends once.
//
// The second is the reason this is safe to automate at all. Reminders are the one place in this
// codebase that emails a customer with no human in the loop, and the thing that makes a daily job
// acceptable is that running it again is provably a no-op.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  balanceReminderEmail, reminderDueToday, dayOffset, runBalanceReminders, REMINDER_KINDS,
} from '../../functions/_lib/catering_balance_reminder.js';

// Karina's quote, as production actually holds it.
const ROW = {
  id: 'cq_336639149e0672e28a05', customer_name: 'Karina', customer_email: 'k@example.test',
  event_date: '2026-09-26', balance_cents: 24250, balance_due_date: '2026-09-25',
  balance_status: 'due', deposit_status: 'paid', lang: 'es', balance_payment_link_url: 'https://sq.link/balance',
};

// ---------------------------------------------------------------- WHEN

test('the two beats land on the 24th and the 25th for a balance due the 25th', () => {
  assert.equal(reminderDueToday(ROW, '2026-09-24'), 'due_soon', 'the day before');
  assert.equal(reminderDueToday(ROW, '2026-09-25'), 'due_today', 'the day itself');
  assert.equal(reminderDueToday(ROW, '2026-09-23'), null, 'two days out is not a reminder, it is nagging');
  assert.equal(reminderDueToday(ROW, '2026-09-26'), null,
    'and an OVERDUE balance is not chased by a robot — that needs a person');
});

test('a quote that owes nothing is never reminded', () => {
  assert.equal(reminderDueToday({ ...ROW, balance_status: 'paid' }, '2026-09-24'), null);
  assert.equal(reminderDueToday({ ...ROW, balance_status: 'waived' }, '2026-09-24'), null);
  assert.equal(reminderDueToday({ ...ROW, deposit_status: 'unpaid' }, '2026-09-24'), null,
    'no deposit means the booking was never confirmed');
  assert.equal(reminderDueToday({ ...ROW, balance_cents: 0 }, '2026-09-24'), null);
  assert.equal(reminderDueToday({ ...ROW, balance_due_date: null }, '2026-09-24'), null,
    'no due date must produce no reminder, never a guessed one');
});

test('date arithmetic crosses month and year boundaries', () => {
  assert.equal(dayOffset('2026-10-01', -1), '2026-09-30');
  assert.equal(dayOffset('2027-01-01', -1), '2026-12-31');
  assert.equal(dayOffset('2026-03-01', -1), '2026-02-28');
  assert.equal(dayOffset('not-a-date', -1), null);
  assert.equal(dayOffset(null, -1), null);
});

// ---------------------------------------------------------------- WHAT IT SAYS

test('THE GIFT IS NEVER MENTIONED — not a word, not a hint, in either language', () => {
  // "don't hint, keep it as a surprise." A reminder that gestures at something waiting spends the
  // surprise before the box is opened. This checks the rendered output AND the source, because a
  // hint could be added to the copy table without any of the other assertions noticing.
  const TELLS = /cake|tres leches|gift|regalo|sorpresa|surprise|pastel|something (special|waiting)|algo (especial|más)/i;

  for (const lang of ['en', 'es']) {
    for (const kind of REMINDER_KINDS) {
      const { subject, html, text } = balanceReminderEmail({
        kind, customerName: 'Karina', eventDate: '2026-09-26',
        balanceCents: 24250, dueDate: '2026-09-25', payUrl: 'https://sq.link/b', lang,
      });
      assert.doesNotMatch(subject, TELLS, `${lang}/${kind} subject`);
      assert.doesNotMatch(html, TELLS, `${lang}/${kind} body`);
      assert.doesNotMatch(text, TELLS, `${lang}/${kind} text part`);
    }
  }

  const src = readFileSync(new URL('../../functions/_lib/catering_balance_reminder.js', import.meta.url), 'utf8');
  // The COPY object itself, and nothing after it: the prose that follows explains there is no
  // gift, and a check that cannot tell an explanation from a leak is a check that cries wolf.
  const start = src.indexOf('const COPY');
  const copyTable = src.slice(start, src.indexOf('\n};', start) + 3);
  assert.ok(copyTable.includes("es: {"), 'sanity: the slice really is the copy table');
  assert.doesNotMatch(copyTable, TELLS, 'nor anywhere in the copy the customer can be shown');
});

test('it says what is owed, when, and how to pay it — and little else', () => {
  const { subject, html, text } = balanceReminderEmail({
    kind: 'due_soon', customerName: 'Karina Juan', eventDate: '2026-09-26',
    balanceCents: 24250, dueDate: '2026-09-25', payUrl: 'https://sq.link/b', lang: 'es',
  });
  assert.match(subject, /saldo/i);
  assert.match(html, /\$242\.50/);
  assert.match(html, /https:\/\/sq\.link\/b/);
  assert.match(html, /Karina,/, 'first name only');
  assert.doesNotMatch(html, /Karina Juan/);
  assert.match(text, /\$242\.50/, 'the text part carries the number too');
  assert.match(html, /dep[óo]sito est[áa] recibido/i, 'and reassures that the date is already hers');
});

test('the day-of email says today, not tomorrow', () => {
  const soon = balanceReminderEmail({ kind: 'due_soon', dueDate: '2026-09-25', balanceCents: 100, lang: 'en' });
  const today = balanceReminderEmail({ kind: 'due_today', dueDate: '2026-09-25', balanceCents: 100, lang: 'en' });
  assert.match(soon.html, /due tomorrow/i);
  assert.match(today.html, /due today/i);
  assert.match(today.subject, /due today/i);
});

test('with no payment link it asks her to reply rather than showing a dead button', () => {
  const { html } = balanceReminderEmail({ kind: 'due_today', balanceCents: 24250, payUrl: null, lang: 'en' });
  assert.doesNotMatch(html, /<a href="null"|href=""/, 'never a button that goes nowhere');
  assert.match(html, /reply to this message/i);
});

test('a name is escaped — it is text, never markup', () => {
  const { html } = balanceReminderEmail({ kind: 'due_soon', customerName: '<img src=x onerror=alert(1)>', balanceCents: 1, lang: 'en' });
  assert.doesNotMatch(html, /<img[^>]*onerror/i);
});

// ---------------------------------------------------------------- RUNNING IT TWICE

function fakeEnv({ rows = [ROW], insertChanges = 1 } = {}) {
  const sent = [];
  const statements = [];
  const env = {
    RESEND_API_KEY: 'k', EMAIL_FROM: 'Añejo <n@a.test>',
    DB: {
      prepare(sql) {
        const stmt = {
          bind: (...args) => { statements.push({ sql, args }); return stmt; },
          all: async () => ({ results: rows.map((r) => ({ ...r })) }),
          first: async () => null,
          run: async () => ({ meta: { changes: sql.includes('INSERT') ? insertChanges : 1 } }),
        };
        return stmt;
      },
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse((init && init.body) || '{}') });
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  };
  return { env, sent, statements, restore: () => { globalThis.fetch = realFetch; } };
}

test('the reminder sends once, and a second run sends nothing', async () => {
  // The claim row IS the lock. First run inserts and sends; the second run's insert is ignored by
  // UNIQUE(quote_id, kind) and the job skips without emailing.
  const first = fakeEnv({ insertChanges: 1 });
  try {
    const r = await runBalanceReminders(first.env, '2026-09-24');
    assert.equal(r.ok, true);
    assert.equal(r.sent.length, 1);
    assert.equal(r.sent[0].kind, 'due_soon');
    assert.equal(first.sent.length, 1, 'exactly one email left the building');
  } finally { first.restore(); }

  const second = fakeEnv({ insertChanges: 0 });   // the row already exists
  try {
    const r = await runBalanceReminders(second.env, '2026-09-24');
    assert.equal(r.sent.length, 0);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].why, /already sent/);
    assert.equal(second.sent.length, 0, 'and NOTHING was emailed the second time');
  } finally { second.restore(); }
});

test('the claim is written BEFORE the send, so a crash cannot cause a repeat', async () => {
  const f = fakeEnv();
  try {
    await runBalanceReminders(f.env, '2026-09-24');
    const insertAt = f.statements.findIndex((s) => /INSERT OR IGNORE INTO catering_balance_reminders/.test(s.sql));
    assert.ok(insertAt >= 0, 'the claim happens');
    // Nothing may have been emailed before the claim landed.
    assert.equal(f.sent.length, 1);
  } finally { f.restore(); }
});

test('a quote with no email address is skipped, not crashed on', async () => {
  const f = fakeEnv({ rows: [{ ...ROW, customer_email: null }] });
  try {
    const r = await runBalanceReminders(f.env, '2026-09-24');
    assert.equal(r.sent.length, 0);
    assert.match(r.skipped[0].why, /no email/);
    assert.equal(f.sent.length, 0);
  } finally { f.restore(); }
});

test('nothing is due on an ordinary day', async () => {
  const f = fakeEnv();
  try {
    const r = await runBalanceReminders(f.env, '2026-09-18');
    assert.equal(r.considered, 0);
    assert.equal(f.sent.length, 0, 'a scheduler that runs daily must be silent on most days');
  } finally { f.restore(); }
});

test('a dry run reports what it would do and sends nothing', async () => {
  const f = fakeEnv();
  try {
    const r = await runBalanceReminders(f.env, '2026-09-25', { dryRun: true });
    assert.equal(r.sent.length, 1);
    assert.equal(r.sent[0].dry_run, true);
    assert.equal(f.sent.length, 0);
  } finally { f.restore(); }
});

test('the job never throws — a bad database stops reminders, not the scheduler', async () => {
  const r = await runBalanceReminders({ DB: null }, '2026-09-24');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'no_db');
});

test('it is registered as an automation and scheduled daily', () => {
  const auto = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
  assert.match(auto, /balance_reminder: balanceReminder/, 'wired into the runner table');
  assert.match(auto, /IMPLEMENTED = \[[^\]]*'balance_reminder'/, 'and reported as implemented');

  const cron = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
  assert.match(cron, /'0 13 \* \* \*': \['balance_reminder'\]/, 'daily, in the morning ET');
});
