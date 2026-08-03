// The owner's roster and override ops must actually be REACHABLE.
//
// THE MISS. contract-staff-roster.test.js proved those ops existed by matching the source text:
//
//     assert.match(OWNER_API, /op === 'set_headcount'/);
//
// A source match proves code is PRESENT. It says nothing about whether a request can ever get to
// it. All three new ops were added at the BOTTOM of onRequestPost, below this line:
//
//     if (!b || !b.account_id) return bad('Missing account_id.');
//
// and the HUB sends only `site_id` for them — a site id already determines its account. So every
// click died on "Missing account_id." before touching its handler. The owner added a person to
// the Pompano roster, saw a message, and nothing happened: the roster stayed empty in production
// while 1076 tests passed.
//
// These tests drive onRequestPost itself with a real signed-in owner session. They fail if the
// ops are ever moved back below the guard, or renamed, or the HUB stops sending what they need.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/hub/owner/contracts.js';

const HUB = readFileSync(new URL('../../public/hub/owner/contracts.html', import.meta.url), 'utf8');

const SITE = {
  id: 'site_x', account_id: 'acct_x', name: 'Pompano Beach', active: 1,
  contact_phone: '+15615550100', delivery_days: 'mon,tue,wed', cutoff_time: '09:15',
  price_per_lunch_cents: 600, delivery_fee_cents: 2000, rush_fee_cents: 0, delivery_window: 'lunch',
};

function ownerEnv() {
  const kv = new Map([['session:tok-owner', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'owner@test', la: Date.now(), created: Date.now() })]]);
  const staff = [];
  const written = { orders: [], ledger: [], events: [] };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...a) {
          return {
            async first() {
              if (q.includes('SELECT active FROM staff')) return { active: 1 };
              if (q.includes('FROM contract_sites WHERE id')) return a[0] === SITE.id ? { ...SITE } : null;
              if (q.includes('FROM contract_accounts WHERE id')) return { id: 'acct_x', name: 'DGP Health & Wellness', status: 'active' };
              if (q.includes('FROM contract_site_staff WHERE site_id = ? AND phone = ?')) return staff.find((s) => s.phone === a[1]) || null;
              if (q.includes('FROM orders WHERE id')) return null;
              return null;
            },
            async all() {
              if (q.includes('FROM contract_site_staff')) return { results: staff.filter((s) => !q.includes('active = 1') || s.active) };
              return { results: [] };
            },
            async run() {
              if (q.startsWith('INSERT INTO contract_site_staff')) staff.push({ id: a[0], site_id: a[1], name: a[3], phone: a[4], is_primary: a[5], added_by: a[6], active: a[7] });
              else if (q.startsWith('UPDATE contract_site_staff SET active')) { const h = staff.find((s) => s.id === a[2]); if (h) h.active = a[0]; return { meta: { changes: h ? 1 : 0 } }; }
              else if (q.startsWith('INSERT INTO orders')) written.orders.push({ id: a[0], status: a[7], headcount: a[18] });
              else if (q.startsWith('INSERT INTO contract_orders')) written.ledger.push({ service_date: a[3], headcount: a[4], total_cents: a[9] });
              else if (q.startsWith('INSERT INTO contract_order_events')) written.events.push({ event: a[5], headcount: a[6], notes: a[8] });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return {
    DB: db, _staff: staff, _written: written,
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
  };
}

const post = (env, body) => onRequestPost({
  env,
  request: new Request('https://x.test/api/hub/owner/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'anejo_sess=tok-owner' },
    body: JSON.stringify(body),
  }),
});

test('add_staff is REACHABLE with only site_id — the exact call the HUB makes', async () => {
  const env = ownerEnv();
  const res = await post(env, { op: 'add_staff', site_id: 'site_x', name: 'Roxana', phone: '561-555-0199' });
  const out = await res.json();
  assert.notEqual(out.error, 'Missing account_id.', 'this is the production failure: rejected before the handler ran');
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(env._staff.length, 1, 'and the person is actually on the roster afterwards');
  assert.equal(env._staff[0].name, 'Roxana');
  assert.ok(Array.isArray(out.staff), 'the updated roster comes straight back so the page can redraw');
});

test('set_staff_active is REACHABLE with only site_id', async () => {
  const env = ownerEnv();
  await post(env, { op: 'add_staff', site_id: 'site_x', name: 'Roxana', phone: '561-555-0199' });
  const res = await post(env, { op: 'set_staff_active', site_id: 'site_x', staff_id: env._staff[0].id, active: false });
  const out = await res.json();
  assert.notEqual(out.error, 'Missing account_id.');
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(env._staff[0].active, 0);
});

test('set_headcount is REACHABLE with only site_id — and still sends no text', async () => {
  const env = ownerEnv();
  const res = await post(env, { op: 'set_headcount', site_id: 'site_x', service_date: '2026-08-03', headcount: 23, reason: 'texted by Roxana' });
  const out = await res.json();
  assert.notEqual(out.error, 'Missing account_id.', 'the override was unreachable in production for the same reason');
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.headcount, 23);
  assert.equal(out.sms_sent, false);
  assert.equal(env._written.ledger[0].total_cents, 23 * 600 + 2000);
  assert.equal(env._written.events[0].event, 'owner_override');
});

test('a site-scoped op still refuses a missing or unknown site', async () => {
  const env = ownerEnv();
  assert.equal((await (await post(env, { op: 'add_staff', name: 'X', phone: '5615550199' })).json()).error, 'Missing site_id.');
  assert.equal((await (await post(env, { op: 'add_staff', site_id: 'nope', name: 'X', phone: '5615550199' })).json()).error, 'Site not found.');
});

test('the account-scoped guard still protects every OTHER op', async () => {
  const env = ownerEnv();
  const out = await (await post(env, { op: 'add_site', name: 'Somewhere' })).json();
  assert.equal(out.error, 'Missing account_id.', 'moving the site-scoped ops above the guard must not disarm it');
});

test('an unauthenticated request never reaches any of it', async () => {
  const env = ownerEnv();
  const res = await onRequestPost({
    env,
    request: new Request('https://x.test/api/hub/owner/contracts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'set_headcount', site_id: 'site_x', service_date: '2026-08-03', headcount: 99, reason: 'x' }),
    }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(env._written.ledger, []);
});

test('the HUB sends exactly what these ops read — site_id, not account_id', () => {
  for (const op of ['add_staff', 'set_staff_active', 'set_headcount']) {
    const i = HUB.indexOf(`op: '${op}'`);
    assert.ok(i > -1, `${op} missing from the HUB`);
    const call = HUB.slice(i, i + 260);
    assert.match(call, /site_id:/, `${op} must send site_id`);
  }
});
