// Holiday notices by SITE and by CHANNEL, and the answer that comes back.
//
// The first test is the defect 0107 exists to fix, written against DGP's real shape — one account,
// two sites — because that is the only account there is. The original per-account unique index let
// Delray Beach's notice through and swallowed Pompano Beach's as "already sent", while the email
// idempotency key (also missing the site) would have let the provider deduplicate the second email.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const COLUMBUS_DUE = Date.parse('2026-09-28T13:20:00Z'); // 14 days before Monday 12 October 2026
const DELRAY_PHONE = '+15615550101';
const POMPANO_PHONE = '+19545550102';

async function dgpEnv(extra = {}) {
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv({
    RESEND_API_KEY: 're_test', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15615550000',
    SQUARE_ENV: 'sandbox', ...extra,
  });
  const db = env.DB.sqlite;
  const sites = db.prepare("SELECT id, name FROM contract_sites WHERE account_id = 'acct_dgp' ORDER BY name").all();
  assert.equal(sites.length, 2, 'DGP is one account with two sites');
  db.prepare("UPDATE contract_accounts SET status = 'active', billing_email = 'accounting@dgp.example' WHERE id = 'acct_dgp'").run();
  db.prepare("UPDATE contract_sites SET active = 1, delivery_days = 'mon,tue,wed,thu', ops_email = NULL WHERE account_id = 'acct_dgp'").run();
  db.prepare('DELETE FROM contract_site_staff').run();
  const [delray, pompano] = sites;
  const add = (site, name, phone) => db.prepare(
    `INSERT INTO contract_site_staff (id, site_id, account_id, name, phone, is_primary, added_by, active, created_at)
     VALUES (?,?,?,?,?,1,'test',1,0)`
  ).run('cst_' + site.id, site.id, 'acct_dgp', name, phone);
  add(delray, 'Coordinator One', DELRAY_PHONE);
  add(pompano, 'Coordinator Two', POMPANO_PHONE);
  return { env, db, delray, pompano };
}

const twilioTo = (calls) => calls.filter((c) => c.url.includes('api.twilio.com')).map((c) => new URLSearchParams(c.init.body).get('To'));

test('two sites on one account are two questions, by email and by text — none silently swallowed', async () => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db, delray, pompano } = await dgpEnv();
  const f = stubFetch();
  let r;
  try { r = await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }

  assert.equal(r.already, 0, 'a first run counts nothing as already sent');
  const rows = db.prepare('SELECT site_id, channel, outcome, holiday_key, observed_date, kind FROM contract_holiday_notices').all();
  assert.equal(rows.length, 4, 'two sites × two channels');
  for (const site of [delray, pompano]) {
    for (const ch of ['email', 'sms']) {
      const row = rows.find((x) => x.site_id === site.id && x.channel === ch);
      assert.ok(row, `${site.name} was asked by ${ch}`);
      assert.equal(row.outcome, 'sent');
      assert.equal(row.holiday_key, 'columbus_day');
      assert.equal(row.observed_date, '2026-10-12');
      assert.equal(row.kind, 'confirm_open');
    }
  }
  assert.deepEqual(twilioTo(f.calls).sort(), [DELRAY_PHONE, POMPANO_PHONE].sort(), 'each site coordinator got their own text');
  const mails = f.calls.filter((c) => c.url.includes('resend'));
  assert.equal(mails.length, 1, 'both locations fall back to the same billing inbox, so they share ONE email');
  assert.match(mails[0].body.html, new RegExp(delray.name), 'and that one email names both locations');
  assert.match(mails[0].body.html, new RegExp(pompano.name));
  assert.equal(r.by_channel.sms.sent, 2);
  assert.equal(r.by_channel.email.sent, 2);
});

test('running the job again the next morning sends nothing twice', async () => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db } = await dgpEnv();
  let f = stubFetch();
  try { await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }
  f = stubFetch();
  let r2;
  try { r2 = await runHolidayNotices(env, { atMs: COLUMBUS_DUE + 86400000 }); } finally { f.restore(); }
  assert.equal(f.calls.length, 0, 'no text and no email on the second morning');
  assert.equal(r2.already, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contract_holiday_notices').get().n, 4);
});

test('a coordinator who texted STOP is not texted — and the other site still is', async () => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { recordUnsubscribe } = await import('../../functions/_lib/audience.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db, delray } = await dgpEnv();
  await recordUnsubscribe(env, { address: DELRAY_PHONE, channel: 'sms', source: 'reply_stop', reason: 'STOP' });
  const f = stubFetch();
  let r;
  try { r = await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }

  assert.deepEqual(twilioTo(f.calls), [POMPANO_PHONE], 'only the site that did not opt out was texted');
  const delraySms = db.prepare("SELECT outcome, failure_reason FROM contract_holiday_notices WHERE site_id = ? AND channel = 'sms'").get(delray.id);
  assert.equal(delraySms.outcome, 'skipped');
  assert.match(delraySms.failure_reason, /STOP/);
  const delrayEmail = db.prepare("SELECT outcome FROM contract_holiday_notices WHERE site_id = ? AND channel = 'email'").get(delray.id);
  assert.equal(delrayEmail.outcome, 'sent', 'opting out of texts is not opting out of the email');
  assert.equal(r.by_channel.sms.withheld, 1);
});

test('the text asks in both languages, names the site and the weekday, and never asks for YES', async () => {
  const { smsBody } = await import('../../functions/_lib/holiday_notices.js');
  const n = { kind: 'confirm_open', holiday_key: 'columbus_day', holiday_name: 'Columbus Day', observed_date: '2026-10-12', actual_date: '2026-10-12', shifted: false, site_name: 'Delray Beach' };
  const t = smsBody(n);
  assert.match(t, /Delray Beach/);
  assert.match(t, /Monday 12 October/);
  assert.match(t, /lunes 12 de octubre/);
  assert.match(t, /OPEN or CLOSED/);
  assert.match(t, /ABIERTO o CERRADO/);
  assert.match(t, /Reply STOP to opt out/);
  assert.doesNotMatch(t, /\bYES\b/, 'YES is a START keyword — the answer would be processed as an opt-in');

  const july = smsBody({ ...n, holiday_key: 'independence_day', holiday_name: 'Independence Day', observed_date: '2026-07-03', actual_date: '2026-07-04', shifted: true });
  assert.match(july, /falls on Saturday 4 July and is observed Friday 3 July/, 'the shifted weekday is explained, not left to be second-guessed');
  assert.match(july, /cae el sábado 4 de julio y se observa el viernes 3 de julio/);

  const closed = smsBody({ ...n, kind: 'kitchen_closed', holiday_key: 'thanksgiving', holiday_name: 'Thanksgiving Day', observed_date: '2026-11-26', actual_date: '2026-11-26' });
  assert.match(closed, /our kitchen is closed Thursday 26 November for Thanksgiving/);
  assert.match(closed, /nuestra cocina cierra el jueves 26 de noviembre/);
  assert.doesNotMatch(closed, /OPEN or CLOSED/, 'a closure is an announcement, not a question');
});

test('a text the carrier refuses is recorded as failed, with the reason — and the email is unaffected', async () => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db } = await dgpEnv();
  const f = stubFetch((url) => (url.includes('api.twilio.com')
    ? new Response(JSON.stringify({ message: 'The To number is not a valid mobile number.' }), { status: 400, headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify({ id: 'em_1' }), { status: 200, headers: { 'content-type': 'application/json' } })));
  let r;
  try { r = await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }
  const sms = db.prepare("SELECT outcome, failure_reason, sent_at FROM contract_holiday_notices WHERE channel = 'sms'").all();
  assert.equal(sms.length, 2);
  for (const x of sms) {
    assert.equal(x.outcome, 'failed', 'never "sent" for a text that did not go');
    assert.match(x.failure_reason, /not a valid mobile/);
    assert.equal(x.sent_at, null);
  }
  assert.equal(r.by_channel.sms.failed, 2);
  assert.equal(r.by_channel.email.sent, 2);
});

test('a reply is recorded on the notice: clear answers are kept, sentences stay verbatim, STOP is never an answer', async () => {
  const { runHolidayNotices, recordHolidayReply, readHolidayAnswer } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db, delray, pompano } = await dgpEnv();
  const f = stubFetch();
  try { await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }
  const row = (site) => db.prepare("SELECT reply_text, reply_answer FROM contract_holiday_notices WHERE site_id = ? AND channel = 'sms'").get(site.id);

  const a = await recordHolidayReply(env, { from: DELRAY_PHONE, body: 'Cerrado.', atMs: COLUMBUS_DUE + 3600000 });
  assert.equal(a.answer, 'closed');
  assert.deepEqual({ ...row(delray) }, { reply_text: 'Cerrado.', reply_answer: 'closed' });

  // Chit-chat afterwards must not erase the answer that matters.
  await recordHolidayReply(env, { from: DELRAY_PHONE, body: 'gracias!', atMs: COLUMBUS_DUE + 7200000 });
  assert.deepEqual({ ...row(delray) }, { reply_text: 'Cerrado.', reply_answer: 'closed' });

  // A sentence is kept for a person to read, never rounded to a yes or a no.
  await recordHolidayReply(env, { from: POMPANO_PHONE, body: 'closed until 1pm, open after', atMs: COLUMBUS_DUE + 3600000 });
  assert.deepEqual({ ...row(pompano) }, { reply_text: 'closed until 1pm, open after', reply_answer: null });

  // Consent keywords belong to the webhook's opt-out handling, not to the holiday answer.
  assert.equal(await recordHolidayReply(env, { from: POMPANO_PHONE, body: 'STOP', atMs: COLUMBUS_DUE + 3600000 }), null);
  assert.equal(row(pompano).reply_text, 'closed until 1pm, open after');

  assert.equal(await recordHolidayReply(env, { from: '+13055559999', body: 'CLOSED', atMs: COLUMBUS_DUE }), null, 'a number we never asked is not attached to anything');

  assert.equal(readHolidayAnswer(' open '), 'open');
  assert.equal(readHolidayAnswer('ABIERTO'), 'open');
  assert.equal(readHolidayAnswer('YES'), null);
  assert.equal(readHolidayAnswer("we're closed"), null);
});

test('a text back from a roster phone is titled with the person, the client and the answer — and still threaded verbatim', async () => {
  const { onRequestPost } = await import('../../functions/api/webhooks/twilio.js');
  const { env, db, delray } = await dgpEnv({ TWILIO_AUTH_TOKEN: '' });   // no token → sandbox-permissive signature check
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO contract_holiday_notices (id, account_id, site_id, holiday_key, observed_date, kind, channel, recipient_phone, outcome, sent_at, created_at)
     VALUES ('hnot_t', 'acct_dgp', ?, 'columbus_day', ?, 'confirm_open', 'sms', ?, 'sent', ?, ?)`
  ).run(delray.id, soon, DELRAY_PHONE, Date.now() - 3600000, Date.now() - 3600000);

  const res = await onRequestPost({ env, request: new Request('https://anejo.test/api/webhooks/twilio', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: DELRAY_PHONE, To: '+15615550000', Body: 'CLOSED' }).toString(),
  }) });
  assert.equal(res.status, 200);

  const th = db.prepare('SELECT id, subject FROM threads ORDER BY created_at DESC LIMIT 1').get();
  assert.match(th.subject, /Coordinator One/);
  assert.match(th.subject, /Delray Beach/);
  assert.match(th.subject, /Columbus Day: CLOSED/);
  assert.equal(db.prepare('SELECT body FROM messages WHERE thread_id = ?').get(th.id).body, 'CLOSED', 'the text itself is kept exactly as sent');
  assert.equal(db.prepare("SELECT reply_answer FROM contract_holiday_notices WHERE id = 'hnot_t'").get().reply_answer, 'closed');
});

test('texts can be switched off, and then only the email goes', async () => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db } = await dgpEnv();
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('holidays.sms_enabled', 'false', 0)").run();
  const f = stubFetch();
  try { await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }
  assert.equal(twilioTo(f.calls).length, 0);
  assert.deepEqual(db.prepare('SELECT DISTINCT channel FROM contract_holiday_notices').all().map((x) => x.channel), ['email']);
});

test('the outlook shows, before the day, which site a notice cannot reach — and never a full phone number', async () => {
  const { runHolidayNotices, holidayOutlook } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const { env, db, pompano } = await dgpEnv();
  const f = stubFetch();
  try { await runHolidayNotices(env, { atMs: COLUMBUS_DUE }); } finally { f.restore(); }

  let o = await holidayOutlook(env, { atMs: COLUMBUS_DUE });
  assert.equal(o.sites.length, 2);
  assert.ok(o.sites.every((x) => x.email === 'billing_fallback'), 'no site has its own ops email yet, and that is said out loud');
  assert.ok(o.sites.every((x) => x.sms === 'ok'));
  assert.ok(o.notices.length >= 4);
  assert.ok(o.notices.every((x) => !x.recipient_phone || /^•••\d{4}$/.test(x.recipient_phone)), 'phones are masked in the owner view');

  db.prepare('DELETE FROM contract_site_staff WHERE site_id = ?').run(pompano.id);
  db.prepare('UPDATE contract_sites SET contact_phone = NULL WHERE id = ?').run(pompano.id);
  o = await holidayOutlook(env, { atMs: COLUMBUS_DUE });
  assert.equal(o.sites.find((x) => x.site_id === pompano.id).sms, 'none', 'a site nobody can text is flagged before the holiday, not after');
});
