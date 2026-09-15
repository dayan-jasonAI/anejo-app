// The kitchen's closure calendar as Dayan set it on 2026-09-15: closed on every federal holiday plus New
// Year's Eve, Easter and Christmas Eve — with DGP's accountant and an owner on ONE email, so whoever sees
// it first answers, and a question aimed at the thing that actually goes wrong: "I always find out the
// day before."
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ALL_CLOSED = ['new_years_day', 'mlk_day', 'washingtons_birthday', 'memorial_day', 'juneteenth', 'independence_day', 'labor_day',
  'columbus_day', 'veterans_day', 'thanksgiving', 'christmas_day', 'new_years_eve', 'easter', 'christmas_eve'];
const DELRAY_PHONE = '+15615550101';
const POMPANO_PHONE = '+19545550102';

async function dgp({ days = 'mon,tue,wed,thu', ops = null, closed = ALL_CLOSED, sender = true } = {}) {
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv({ RESEND_API_KEY: 're_test', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15615550000', SQUARE_ENV: 'sandbox' });
  const db = env.DB.sqlite;
  const put = (k, v) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,0)').run(k, v);
  const sites = db.prepare("SELECT id, name FROM contract_sites WHERE account_id = 'acct_dgp' ORDER BY name").all();
  db.prepare("UPDATE contract_accounts SET status = 'active', billing_email = 'accounting@dgp.example' WHERE id = 'acct_dgp'").run();
  db.prepare("UPDATE contract_sites SET active = 1, delivery_days = ?, ops_email = ? WHERE account_id = 'acct_dgp'").run(days, ops);
  db.prepare('DELETE FROM contract_site_staff').run();
  const [delray, pompano] = sites;
  const add = (site, phone) => db.prepare(
    `INSERT INTO contract_site_staff (id, site_id, account_id, name, phone, is_primary, added_by, active, created_at) VALUES (?,?,?,?,?,1,'test',1,0)`
  ).run('cst_' + site.id, site.id, 'acct_dgp', 'Coordinator ' + site.name, phone);
  add(delray, DELRAY_PHONE);
  add(pompano, POMPANO_PHONE);
  if (closed) put('holidays.kitchen_closed', JSON.stringify(closed));
  if (sender) put('sales.sender', JSON.stringify({ from_name: 'Dayan at Añejo', from_email: 'dayan@anejo.example', reply_to: 'dayan@anejo.example' }));
  return { env, db, delray, pompano };
}

const run = async (env, atMs) => {
  const { runHolidayNotices } = await import('../../functions/_lib/holiday_notices.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const f = stubFetch();
  try { return { r: await runHolidayNotices(env, { atMs }), calls: f.calls }; } finally { f.restore(); }
};
const mails = (calls) => calls.filter((c) => c.url.includes('resend'));
const texts = (calls) => calls.filter((c) => c.url.includes('api.twilio.com')).map((c) => new URLSearchParams(c.init.body));

test('Easter is computed, and the extras are observed on the day itself — they never shift for a weekend', async () => {
  const { observances, OBSERVANCE_KEYS, HOLIDAY_KEYS } = await import('../../functions/_lib/holidays.js');
  const on = (y, k) => observances(y).find((h) => h.key === k);
  assert.equal(on(2026, 'easter').observed, '2026-04-05');
  assert.equal(on(2027, 'easter').observed, '2027-03-28');
  assert.equal(on(2028, 'easter').observed, '2028-04-16');
  // 24 December 2022 was a Saturday. A federal holiday would move; Christmas Eve does not.
  assert.equal(on(2022, 'christmas_eve').observed, '2022-12-24');
  assert.equal(on(2022, 'christmas_eve').shifted, false);
  assert.equal(on(2027, 'new_years_eve').observed, '2027-12-31');
  assert.equal(on(2027, 'new_years_eve').federal, false);
  assert.equal(HOLIDAY_KEYS.length, 11, 'the federal list is still exactly the eleven');
  assert.equal(OBSERVANCE_KEYS.length, 14);
});

test('a closed holiday reaches the accountant and the owner on ONE email naming both locations, asks about the rest of the week, and replies land with Dayan', async () => {
  const { env, db, delray, pompano } = await dgp({ ops: 'roxana@dgp.example, leslie@dgp.example' });
  const { r, calls } = await run(env, Date.parse('2026-10-05T13:20:00Z'));   // Columbus Day, 7 days out

  const m = mails(calls);
  assert.equal(m.length, 1, 'one email about one closed Monday, not one per location');
  assert.deepEqual(m[0].body.to.slice().sort(), ['leslie@dgp.example', 'roxana@dgp.example'], 'both people on the same email');
  assert.match(m[0].body.subject, /Our kitchen is closed Monday 12 October for Columbus Day/);
  assert.match(m[0].body.html, new RegExp(delray.name));
  assert.match(m[0].body.html, new RegExp(pompano.name));
  assert.match(m[0].body.html, /closed on any other day that week/, 'the double check he asked for');
  assert.match(m[0].body.html, /Whoever sees this first can answer/);
  assert.deepEqual(m[0].body.reply_to, ['dayan@anejo.example'], 'a reply reaches a person, not noreply@');
  assert.match(m[0].body.from, /Dayan at Añejo <dayan@anejo\.example>/);
  assert.doesNotMatch(m[0].body.subject + m[0].body.html, /—/, 'no em dashes in what the client reads');

  const rows = db.prepare("SELECT site_id, outcome, recipient_email, kind FROM contract_holiday_notices WHERE channel = 'email'").all();
  assert.equal(rows.length, 2, 'each location still has its own record');
  for (const x of rows) {
    assert.equal(x.outcome, 'sent');
    assert.equal(x.kind, 'kitchen_closed');
    assert.equal(x.recipient_email, 'roxana@dgp.example, leslie@dgp.example');
  }

  const t = texts(calls);
  assert.equal(t.length, 2, 'the two coordinators have different phones, so each gets a text');
  for (const p of t) {
    assert.match(p.get('Body'), /Closed any other day that week\?/);
    assert.match(p.get('Body'), /otro día esa semana/);
  }
  assert.equal(r.messages, 3);
  assert.equal(r.by_channel.email.sent, 2, 'two locations told by email');
});

test('Christmas Eve and an observed Christmas on the same Friday are ONE notice, not two', async () => {
  const { env, db } = await dgp({ days: 'fri', ops: 'roxana@dgp.example, leslie@dgp.example' });
  const { calls } = await run(env, Date.parse('2027-12-17T13:20:00Z'));   // Friday 24 December 2027, 7 days out

  assert.deepEqual(db.prepare('SELECT DISTINCT holiday_key FROM contract_holiday_notices').all().map((x) => x.holiday_key), ['christmas_day+christmas_eve']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contract_holiday_notices').get().n, 4, 'two locations × two channels, once');
  const m = mails(calls);
  assert.equal(m.length, 1);
  assert.match(m[0].body.subject, /Friday 24 December for Christmas Eve and Christmas Day/);
  assert.match(m[0].body.html, /Christmas Day falls on Saturday 25 December this year and is observed on Friday 24 December/);
});

test('Easter only reaches a location that actually receives lunch on a Sunday', async () => {
  const { env, db, pompano } = await dgp();
  db.prepare("UPDATE contract_sites SET delivery_days = 'sun' WHERE id = ?").run(pompano.id);
  await run(env, Date.parse('2027-03-21T13:20:00Z'));   // Easter Sunday 28 March 2027, 7 days out
  const rows = db.prepare('SELECT site_id, holiday_key FROM contract_holiday_notices').all();
  assert.equal(rows.length, 2, 'email and text, for the one Sunday location');
  assert.ok(rows.every((x) => x.site_id === pompano.id && x.holiday_key === 'easter'));
});

test('an extra day is never asked about when the kitchen is open on it', async () => {
  const { env, db } = await dgp({ days: 'thu', closed: null });
  await run(env, Date.parse('2026-12-10T13:20:00Z'));   // Christmas Eve 2026 is a Thursday, 14 days out
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contract_holiday_notices').get().n, 0,
    'nobody is asked "will you be open on Christmas Eve?" unless the owner closed the kitchen for it');
});

test('an ops email takes several people, normalised — and a wrong address is named, not saved', async () => {
  const { ownerEnv, OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  const { onRequestPost } = await import('../../functions/api/hub/owner/contracts.js');
  const env = ownerEnv();
  const db = env.DB.sqlite;
  db.prepare("UPDATE contract_accounts SET status = 'active' WHERE id = 'acct_dgp'").run();
  const site = db.prepare("SELECT id FROM contract_sites WHERE account_id = 'acct_dgp' ORDER BY name LIMIT 1").get();
  const post = async (body) => (await onRequestPost({ env, request: new Request('https://anejo.test/api/hub/owner/contracts', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) })).json();
  const stored = () => db.prepare('SELECT ops_email FROM contract_sites WHERE id = ?').get(site.id).ops_email;

  let r = await post({ op: 'edit_terms', account_id: 'acct_dgp', site_id: site.id, ops_email: 'Roxana@DGP.example; leslie@dgp.example ,roxana@dgp.example' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(stored(), 'roxana@dgp.example, leslie@dgp.example', 'lower-cased, de-duplicated, one format');

  r = await post({ op: 'edit_terms', account_id: 'acct_dgp', site_id: site.id, ops_email: 'roxana@dgp.example, leslie-at-dgp' });
  assert.notEqual(r.ok, true);
  assert.match(r.error, /leslie-at-dgp/, 'the error names the address that is wrong');
  assert.equal(stored(), 'roxana@dgp.example, leslie@dgp.example', 'and the good list is not replaced');
});
