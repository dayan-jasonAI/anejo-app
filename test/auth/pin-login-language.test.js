import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/auth/pin-login.js';
import { hashPin } from '../../functions/_lib/pin.js';

function fixtureStaff(lang, extra = {}) {
  return {
    id: 'staff_fixture', email: 'fixture@example.test', phone: '+15615550102', name: 'Fixture',
    role: 'owner', team: 'front_office', active: 1, pin_salt: 'fixture-salt',
    pin_hash: null, login_fail_count: 0, must_change_pin: 0, lang, ...extra,
  };
}

async function makeFixture(lang, extra = {}) {
  const staff = fixtureStaff(lang, extra);
  staff.pin_hash = await hashPin('2468', staff.pin_salt);
  const sqlSeen = [];
  const db = {
    prepare(sql) {
      sqlSeen.push(sql);
      const stmt = { args: [] };
      stmt.bind = (...args) => { stmt.args = args; return stmt; };
      stmt.first = async () => sql.includes('FROM staff') ? staff : null;
      stmt.run = async () => ({ success: true, meta: { changes: 1 } });
      stmt.all = async () => ({ success: true, results: [] });
      return stmt;
    },
  };
  const kv = new Map();
  const env = {
    DB: db,
    SESSIONS: {
      async get(key) { return kv.get(key) || null; },
      async put(key, value) { kv.set(key, value); },
      async delete(key) { kv.delete(key); },
    },
  };
  return { staff, env, kv, sqlSeen };
}

async function login(env, pin = '2468') {
  const request = new Request('https://anejo.test/api/auth/pin-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.3' },
    body: JSON.stringify({ identifier: 'fixture@example.test', pin }),
  });
  const response = await onRequestPost({ request, env });
  return { response, body: await response.json() };
}

test('successful PIN login returns normalized Spanish profile language', async () => {
  const f = await makeFixture('ES');
  const { response, body } = await login(f.env);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.lang, 'es');
  assert.equal(response.headers.get('set-cookie')?.includes('HttpOnly'), true);
});

test('English and malformed saved preferences normalize to a supported language', async () => {
  for (const [saved, expected] of [['en', 'en'], ['invalid', 'en'], [null, 'en']]) {
    const f = await makeFixture(saved);
    const { body } = await login(f.env);
    assert.equal(body.lang, expected, `saved profile value ${String(saved)}`);
  }
});

test('failed PIN authentication does not disclose a staff language', async () => {
  const f = await makeFixture('es');
  const { response, body } = await login(f.env, '0000');
  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(Object.hasOwn(body, 'lang'), false);
  assert.equal([...f.kv.keys()].some(key => key.startsWith('session:')), false);
});

test('successful PIN login preserves forced PIN-change state and does not alter the PIN hash or preference', async () => {
  const f = await makeFixture('es', { must_change_pin: 1 });
  const pinHash = f.staff.pin_hash;
  const { body } = await login(f.env);
  assert.equal(body.must_change_pin, true);
  assert.equal(body.lang, 'es');
  assert.equal(f.staff.pin_hash, pinHash);
  assert.equal(f.staff.lang, 'es');
  assert.ok(f.sqlSeen.every(sql => !/UPDATE\s+staff[\s\S]*\blang\s*=/i.test(sql)));
});
