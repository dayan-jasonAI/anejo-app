import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { makeD1, makeKV } from '../helpers/d1.js';
import { sendPushTickle, sendPushToEmail } from '../../functions/_lib/push.js';
import { createHubPushMessage, safeHubPushUrl } from '../../functions/_lib/push-message.js';
import { onRequestGet as peek } from '../../functions/api/hub/push/peek.js';
import { ALERT_TYPES } from '../../functions/_lib/alerts.js';

const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
async function fixture(subs) {
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const client = createECDH('prime256v1'); client.generateKeys();
  const auth = randomBytes(16);
  const removed = [];
  const rows = subs || [{ id: 'device1', audience: 'staff', endpoint: 'https://web.push.apple.com/test', p256dh: b64(client.getPublicKey()), auth: b64(auth) }];
  const env = {
    VAPID_PUBLIC_KEY: b64(await crypto.subtle.exportKey('raw', vapid.publicKey)),
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', vapid.privateKey)),
    VAPID_SUBJECT: 'mailto:push@example.test',
    DB: makeD1([
      [/SELECT id, endpoint, p256dh, auth, audience FROM/, () => rows],
      [/DELETE FROM push_subscriptions WHERE id = \?/, ({ args }) => { removed.push(args[0]); return 1; }],
    ]),
  };
  return { env, rows, client, auth, removed };
}

// Independent receiver implementation using Node HKDF + AES-GCM, not the sending library.
function decrypt(body, client, auth) {
  const wire = Buffer.from(body);
  assert.equal(wire.length, 4096);
  assert.equal(wire.readUInt32BE(16), 4096);
  assert.equal(wire[20], 65);
  const server = wire.subarray(21, 86);
  const secret = client.computeSecret(server);
  const ikm = hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), client.getPublicKey(), server]), 32);
  const key = hkdfSync('sha256', ikm, wire.subarray(0, 16), Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfSync('sha256', ikm, wire.subarray(0, 16), Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createDecipheriv('aes-128-gcm', key, Buffer.from(nonce));
  cipher.setAuthTag(wire.subarray(-16));
  const plain = Buffer.concat([cipher.update(wire.subarray(86, -16)), cipher.final()]);
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  assert.equal(plain[end], 2);
  return JSON.parse(plain.subarray(0, end).toString());
}

test('staff push encrypts the precise bilingual event with Apple-compatible aes128gcm and valid VAPID', async () => {
  const { env, client, auth } = await fixture();
  const oldFetch = globalThis.fetch; let request;
  globalThis.fetch = async (_url, init) => { request = init; return { status: 201 }; };
  try {
    assert.deepEqual(await sendPushTickle(env, { roles: ['owner'], notification: { type: 'kitchen_ready_delivery', id: 'alert_ready1', title: 'PRIVATE CUSTOMER', body: 'PRIVATE ADDRESS' } }), { sent: 1, failed: 0 });
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(request.headers['content-encoding'], 'aes128gcm');
  assert.equal(request.headers.ttl, '3600');
  assert.match(request.headers.authorization, /^vapid t=.+, k=/);
  const jwt = request.headers.authorization.match(/^vapid t=([^,]+)/)[1].split('.');
  const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  const publicJwk = JSON.parse(env.VAPID_PRIVATE_JWK); delete publicJwk.d; publicJwk.key_ops = ['verify'];
  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(jwt[2], 'base64url'), Buffer.from(jwt.slice(0, 2).join('.'))), true);
  const payload = decrypt(request.body, client, auth);
  assert.equal(payload.type, 'kitchen_ready_delivery');
  assert.match(payload.title, /ready for delivery/);
  assert.match(payload.title_es, /listo para entregar/);
  assert.equal(payload.tag, 'anejo-hub-alert_ready1');
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE/);
  assert.doesNotMatch(Buffer.from(request.body).toString(), /ready for delivery/);
});

test('expired subscriptions are removed by exact id, invalid keys do not send empty misleading pushes', async () => {
  const { env, rows, removed } = await fixture();
  rows.push({ ...rows[0], id: 'invalid', auth: 'bad' });
  const oldFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return { status: 410 }; };
  try {
    assert.deepEqual(await sendPushTickle(env, { roles: ['owner'], notification: { type: 'new_paid_order', id: 'a1' } }), { sent: 0, failed: 2 });
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(calls, 1); assert.deepEqual(removed, ['device1']);
});

test('customer push remains payload-less and customer-scoped', async () => {
  const { env, rows } = await fixture(); rows[0].audience = 'customer';
  const oldFetch = globalThis.fetch; let request;
  globalThis.fetch = async (_url, init) => { request = init; return { status: 201 }; };
  try { assert.equal((await sendPushToEmail(env, 'buyer@example.test')).sent, 1); }
  finally { globalThis.fetch = oldFetch; }
  assert.equal(request.body, undefined);
  assert.match(env.DB.sqlLog()[0], /audience = 'customer'/);
});

test('subscription audience SQL uses active current staff roles and preserves null-id portals', async () => {
  const { env } = await fixture([]);
  await sendPushTickle(env, { roles: ['owner', 'trainer', 'client'] });
  const query = env.DB.calls[0];
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE staff (id TEXT, role TEXT, active INTEGER);
      CREATE TABLE push_subscriptions (id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, audience TEXT, staff_id TEXT, email TEXT, role TEXT);
      INSERT INTO staff VALUES ('active', 'owner', 1), ('disabled', 'owner', 0), ('demoted', 'kitchen', 1), ('promoted', 'owner', 1);
      INSERT INTO push_subscriptions (id, audience, staff_id, role) VALUES
        ('active-device','staff','active','owner'), ('disabled-device','staff','disabled','owner'),
        ('demoted-device','staff','demoted','owner'), ('promoted-device','staff','promoted','kitchen'),
        ('deleted-device','staff','deleted','owner'), ('missing-owner','staff',NULL,'owner'),
        ('trainer-device','staff',NULL,'trainer'), ('client-device','staff',NULL,'client'),
        ('customer-device','customer',NULL,'owner');`);
    assert.deepEqual(db.prepare(query.sql).all(...query.args).map((r) => r.id).sort(), ['active-device','client-device','promoted-device','trainer-device']);
  } finally { db.close(); }
});

test('database errors are reported as failed rather than successful zero-recipient sends', async () => {
  const { env } = await fixture(); env.DB = makeD1([]);
  assert.deepEqual(await sendPushTickle(env, { roles: ['owner'], notification: { type: 'new_order' } }), { sent: 0, failed: 1 });
});

test('network sends are bounded to four in flight and every selected device is attempted', async () => {
  const { env, rows } = await fixture();
  for (let i = 1; i < 9; i++) rows.push({ ...rows[0], id: `device${i + 1}` });
  const oldFetch = globalThis.fetch; let active = 0; let peak = 0; let calls = 0;
  globalThis.fetch = async () => {
    active++; calls++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active--; return { status: 201 };
  };
  try {
    assert.deepEqual(await sendPushTickle(env, { roles: ['owner'], notification: { type: 'new_order', id: 'a1' } }), { sent: 9, failed: 0 });
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(calls, 9); assert.equal(peak, 4);
});

test('every declared alert type has explicit English and Spanish lock-screen copy', () => {
  for (const type of ALERT_TYPES) {
    const message = createHubPushMessage({ type });
    assert.equal(message.type, type, `Missing taxonomy for ${type}`);
    assert.ok(message.title && message.title_es && message.body && message.body_es);
  }
});

test('safe notification taxonomy distinguishes paid, unpaid, delivery-ready, pickup-ready and message', () => {
  const types = ['new_order', 'new_paid_order', 'kitchen_ready_delivery', 'kitchen_ready_pickup', 'new_message'];
  const messages = types.map((type) => createHubPushMessage({ type, id: type }));
  assert.equal(new Set(messages.map((m) => m.title)).size, types.length);
  assert.equal(new Set(messages.map((m) => m.title_es)).size, types.length);
  assert.equal(new Set(messages.map((m) => m.tag)).size, types.length);
  for (const url of ['https://evil.test', '//evil.test', '/hub/../../api/auth/logout', '/hub/\\evil.test', '/hub/../login']) assert.equal(safeHubPushUrl(url), '/hub/');
  assert.equal(safeHubPushUrl('/hub/owner/orders.html?order=o1'), '/hub/owner/orders.html?order=o1');
  assert.equal(createHubPushMessage({ type: '__proto__' }).type, 'hub_notice');
});

test('legacy peek never exports private alert text and signals no pending events without inventing messages', async () => {
  const SESSIONS = makeKV({ 'session:test': JSON.stringify({ type: 'staff', uid: 's1', role: 'owner', la: Date.now() }) });
  let alert = null;
  const DB = makeD1([
    [/SELECT active FROM staff/, () => ({ active: 1 })],
    [/SELECT COUNT\(\*\) AS n/, () => ({ n: 0 })],
    [/SELECT id, alert_type, created_at FROM alerts/, () => alert],
  ]);
  const request = new Request('https://anejocateringco.com/api/hub/push/peek', { headers: { Cookie: 'anejo_sess=test' } });
  const empty = await (await peek({ request, env: { DB, SESSIONS } })).json();
  assert.equal(empty.notify, false);
  alert = { id: 'a1', alert_type: 'new_paid_order', created_at: Date.now(), title: 'PRIVATE NAME', body: 'PRIVATE ADDRESS' };
  const pending = await (await peek({ request, env: { DB, SESSIONS } })).json();
  assert.equal(pending.notify, true); assert.equal(pending.title, 'New paid order');
  assert.equal(pending.title_es, 'Nuevo pedido pagado');
  assert.doesNotMatch(JSON.stringify(pending), /PRIVATE/);
});
