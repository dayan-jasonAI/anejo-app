// Dayan, 2026-09-15: before an order is marked ready, the cook photographs the food inside the open
// container and then the container closed. "If I don't get those two pictures, the order cannot be
// set as ready." These tests run the real kitchen endpoint against real SQLite with every migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { hashPin } from '../../functions/_lib/pin.js';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/kitchen/orders.js';
import { markKitchenReady } from '../../functions/_lib/kitchen-ready.js';
import { onRequestGet as serveMedia } from '../../functions/api/hub/media/[[path]].js';
import { onRequestPost as ownerMenuPost } from '../../functions/api/hub/owner/menu.js';

const PIN = '482913';
const KITCHEN = 'anejo_sess=tok-kitchen';
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('synthetic jpeg bytes').toString('base64');
const T0 = Date.parse('2026-09-16T13:00:00Z');

function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, opts) { objects.set(key, { body, opts }); },
    async get(key) { const o = objects.get(key); return o ? { body: 'bytes', httpMetadata: o.opts && o.opts.httpMetadata } : null; },
  };
}

async function kitchen({ status = 'prep', media = bucket() } = {}) {
  const env = ownerEnv(media ? { MEDIA: media } : {});
  const db = env.DB.sqlite;
  db.prepare("UPDATE staff SET pin_hash = ?, pin_salt = 'salt-k' WHERE id = 'stf_k'").run(await hashPin(PIN, 'salt-k'));
  db.prepare(
    `INSERT INTO orders (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents, status,
       customer_name, delivery_city, delivery_state, created_at, updated_at)
     VALUES ('ord_k1', ?, '2026-09-16', 'lunch', 1999, 0, 1999, ?, 'Synthetic customer', 'Palm Beach', 'FL', ?, ?)`
  ).run(JSON.stringify([{ id: 'vida', name: 'VIDA', qty: 1, price_cents: 1999 }]), status, T0, T0);
  return { env, db, media };
}

const post = (env, body, cookie = KITCHEN) => onRequestPost({ env, request: new Request('https://anejo.test/api/hub/kitchen/orders', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'ord_k1', ...body }),
}) });
const board = async (env) => (await onRequestGet({ env, request: new Request('https://anejo.test/api/hub/kitchen/orders', { headers: { Cookie: KITCHEN } }) })).json();
const statusOf = (db) => db.prepare("SELECT status FROM orders WHERE id = 'ord_k1'").get().status;

test('Mark ready is refused until both photos exist, and the cook is told which one is missing', async () => {
  const { env, db, media } = await kitchen();
  let res = await post(env, { action: 'mark_ready', pin: PIN });
  assert.equal(res.status, 409);
  assert.deepEqual((await res.json()).missing_photos, ['contents', 'packed']);
  assert.equal(statusOf(db), 'prep');

  res = await post(env, { action: 'photo', kind: 'contents', data_url: JPEG });
  assert.equal(res.status, 200, await res.clone().text());
  const saved = await res.json();
  assert.match(saved.url, /^\/api\/hub\/media\/kitchen\/\d{4}-\d{2}\/med_[^/]+_contents\.jpg$/);
  assert.equal(media.objects.size, 1, 'the photo is really in the bucket');

  res = await post(env, { action: 'mark_ready', pin: PIN });
  assert.equal(res.status, 409);
  assert.deepEqual((await res.json()).missing_photos, ['packed']);

  assert.equal((await post(env, { action: 'photo', kind: 'packed', data_url: JPEG })).status, 200);
  res = await post(env, { action: 'mark_ready', pin: PIN });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(statusOf(db), 'ready');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n, 1);
  const who = db.prepare("SELECT taken_by, taken_by_name FROM kitchen_photos WHERE kind = 'packed'").get();
  assert.deepEqual({ ...who }, { taken_by: 'stf_k', taken_by_name: 'Cook' }, 'each photo is attributed to the signed-in cook');
});

test('the rule lives in the ready UPDATE itself, so no other caller can skip it', async () => {
  const { env, db } = await kitchen();
  assert.equal((await markKitchenReady(env, { id: 'ord_k1' }, T0 + 1000)).changed, false);
  assert.equal(statusOf(db), 'prep');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n, 0);
});

test('a photo is taken during prep, must be an image, and only counts once it is really stored', async () => {
  let { env, db } = await kitchen({ status: 'paid' });
  assert.equal((await post(env, { action: 'photo', kind: 'contents', data_url: JPEG })).status, 409, 'start prep first');

  ({ env, db } = await kitchen());
  assert.equal((await post(env, { action: 'photo', kind: 'contents', data_url: 'data:text/plain;base64,aGVsbG8=' })).status, 400);
  assert.equal((await post(env, { action: 'photo', kind: 'lid', data_url: JPEG })).status, 400);

  ({ env, db } = await kitchen({ media: null }));
  const res = await post(env, { action: 'photo', kind: 'contents', data_url: JPEG });
  assert.equal(res.status, 503, 'no bucket: refused, not kept inline where nobody can open it');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kitchen_photos').get().n, 0);
});

test('a retake replaces the earlier photo: the old one is kept for the record but no longer counts', async () => {
  const { env, db } = await kitchen();
  const first = await (await post(env, { action: 'photo', kind: 'contents', data_url: JPEG })).json();
  const second = await (await post(env, { action: 'photo', kind: 'contents', data_url: JPEG })).json();
  assert.notEqual(first.url, second.url);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kitchen_photos').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kitchen_photos WHERE superseded_at IS NULL').get().n, 1);
  const order = (await board(env)).board.prep.find((o) => o.id === 'ord_k1');
  assert.equal(order.photos.contents.url, second.url);
  assert.equal(order.photos.packed, undefined);
});

test('kitchen photos are served to kitchen staff and never to other HUB roles', async () => {
  const { env, media } = await kitchen();
  await post(env, { action: 'photo', kind: 'contents', data_url: JPEG });
  const key = [...media.objects.keys()][0];
  const get = (cookie) => serveMedia({ env, params: { path: key.split('/') }, request: new Request(`https://anejo.test/api/hub/media/${key}`, { headers: { Cookie: cookie } }) });
  assert.equal((await get(KITCHEN)).status, 200);
  assert.equal((await get(OWNER_COOKIE)).status, 200);
  assert.equal((await get('anejo_sess=tok-marketing')).status, 404, 'a signed-in marketing session is not kitchen staff');
});

test('Start prep stamps the prep clock once, and the board shows the countdown from the item prep time', async () => {
  const { env, db } = await kitchen({ status: 'paid' });
  db.prepare("UPDATE menu_items SET prep_minutes = 25 WHERE id = 'vida'").run();
  assert.equal((await post(env, { action: 'prep_start', pin: PIN })).status, 200);
  const first = db.prepare("SELECT prep_started_at FROM orders WHERE id = 'ord_k1'").get().prep_started_at;
  assert.ok(first > 0);
  assert.equal((await post(env, { action: 'prep_start', pin: PIN })).status, 200);
  assert.equal(db.prepare("SELECT prep_started_at FROM orders WHERE id = 'ord_k1'").get().prep_started_at, first, 'a second tap never resets the timer');

  const order = (await board(env)).board.prep.find((o) => o.id === 'ord_k1');
  assert.equal(order.timing.estimate_minutes, 25);
  assert.equal(order.timing.due_at, first + 25 * 60000);
  assert.equal(order.timing.ready_by_at, Date.parse('2026-09-16T14:30:00Z'));
});

test('the owner sets an item prep time and the kitchen timing, and nonsense is refused', async () => {
  const { env, db } = await kitchen();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  const owner = (body) => ownerMenuPost({ env, request: new Request('https://anejo.test/api/hub/owner/menu', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) });
  try {
    let res = await owner({ op: 'update_item', id: 'vida', prep_minutes: 40 });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(db.prepare("SELECT prep_minutes FROM menu_items WHERE id = 'vida'").get().prep_minutes, 40);
    assert.equal((await owner({ op: 'update_item', id: 'vida', prep_minutes: 0 })).status, 400);
    assert.equal((await owner({ op: 'update_item', id: 'vida', prep_minutes: '' })).status, 200);
    assert.equal(db.prepare("SELECT prep_minutes FROM menu_items WHERE id = 'vida'").get().prep_minutes, null, 'blank clears it');

    res = await owner({ op: 'update_kitchen_timing', timing: { lunch_start: '11:15', ready_lead_minutes: 20, office_prep_minutes: 50 } });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual((await res.json()).kitchen_timing, { lunch_start: '11:15', dinner_start: '17:00', ready_lead_minutes: 20, office_prep_minutes: 50 });
    assert.equal((await owner({ op: 'update_kitchen_timing', timing: { dinner_start: '7pm' } })).status, 400);
    assert.equal((await post(env, { action: 'prep_start', pin: PIN })).status, 200);
    const order = (await board(env)).board.prep.find((o) => o.id === 'ord_k1');
    assert.equal(order.timing.ready_by_at, Date.parse('2026-09-16T14:55:00Z'), 'the board follows the owner: 11:15 minus 20');
  } finally {
    globalThis.fetch = realFetch;
  }
});
