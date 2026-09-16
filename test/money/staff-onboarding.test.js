import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/staff/index.js';

async function create(env, body = {}) {
  const response = await onRequestPost({ env, request: new Request('https://anejo.test/api/hub/owner/staff', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'create', name: 'Fixture Driver', role: 'driver', email: 'fixture@example.test', ...body }),
  }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.ok(env.DB.one('SELECT id FROM staff WHERE id=?', result.id));
  return result;
}

test('suppressed onboarding email is not claimed sent and makes no provider request', async (t) => {
  const env = ownerEnv(); env.RESEND_API_KEY = 'fixture-only';
  env.DB.sqlite.prepare('INSERT INTO email_suppressions VALUES (?,?,?,?,?)').run('fixture@example.test', 'bounced', null, 1, 1);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected provider call'); });
  const result = await create(env);
  assert.deepEqual(result.notifications.email, { ok: true, sent: false, skipped: true, suppressed: 'bounced' });
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('provider rejection leaves staff created and reports onboarding failure', async (t) => {
  const env = ownerEnv(); env.RESEND_API_KEY = 'fixture-only';
  t.mock.method(globalThis, 'fetch', async () => new Response('fixture rejection', { status: 500 }));
  const result = await create(env);
  assert.equal(result.notifications.email.sent, false);
  assert.equal(result.notifications.email.ok, false);
  assert.match(result.notifications.email.error, /fixture rejection/);
});

test('accepted welcome retains receipt and never sends the one-time PIN', async (t) => {
  const env = ownerEnv(); env.RESEND_API_KEY = 'fixture-only';
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { payload = JSON.parse(init.body); return Response.json({ id: 'email_fixture' }); });
  const result = await create(env);
  assert.deepEqual(result.notifications.email, { ok: true, sent: true, status: 'accepted', provider_id: 'email_fixture' });
  assert.ok(!payload.html.includes(result.initial_pin));
});

test('missing receipt is not a confirmed provider acceptance', async (t) => {
  const env = ownerEnv(); env.RESEND_API_KEY = 'fixture-only';
  t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  assert.equal((await create(env)).notifications.email.sent, false);
});

test('phone-only onboarding makes no email request', async (t) => {
  const env = ownerEnv();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected provider call'); });
  const result = await create(env, { email: '', phone: '+15555550199' });
  assert.equal(result.notifications.email, null);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('owner sees accepted, suppressed, failed and unrequested notification states', () => {
  const html = readFileSync(new URL('../../public/hub/owner/staff.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('  function notificationBanner('), html.indexOf('  function loadRoster()'));
  const box = { style: {}, textContent: '' };
  const context = vm.createContext({ window: {}, document: { getElementById: () => box } });
  vm.runInContext(source, context);
  context.notificationBanner({ email: { sent: false, skipped: true }, sms: { sent: true } });
  assert.match(box.textContent, /suppressed address/);
  assert.match(box.textContent, /delivery unconfirmed/);
  context.notificationBanner({ email: { sent: false, error: '<script>bad</script>' } });
  assert.match(box.textContent, /check configuration or provider/);
  assert.match(box.textContent, /not requested/);
  assert.ok(!box.textContent.includes('<script>'));
  assert.match(html, /notificationBanner\(r && r.notifications\)/);
});
