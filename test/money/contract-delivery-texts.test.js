// Contract deliveries tell the office — on the way, about five minutes out, delivered — and the NEXT office
// hears the moment the previous delivery is done. Dayan, 2026-09-15: none of this ever reached DGP, because a
// contract stop's order row has no customer phone and the notices returned in silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SUBMITTER = '+15615550111';
const DELRAY_CONTACT = '+15615550122';
const POMPANO_CONTACT = '+19545550133';
const T0 = Date.parse('2026-09-15T16:00:00Z');

async function world() {
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv({ TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15615550000', GOOGLE_MAPS_API_KEY: 'test-key' });
  const db = env.DB.sqlite;
  const [delray, pompano] = db.prepare("SELECT id, name FROM contract_sites WHERE account_id = 'acct_dgp' ORDER BY name").all();
  db.prepare('UPDATE contract_sites SET contact_phone = ? WHERE id = ?').run(DELRAY_CONTACT, delray.id);
  db.prepare('UPDATE contract_sites SET contact_phone = ? WHERE id = ?').run(POMPANO_CONTACT, pompano.id);
  const order = (site, lat, lng) => {
    const id = `octr_${site.id}_2026-09-15`;
    db.prepare(
      `INSERT INTO orders (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents, status,
         customer_name, delivery_city, delivery_state, delivery_lat, delivery_lng, fulfillment_mode, contract_site_id, headcount, is_rush, created_at, updated_at)
       VALUES (?, '[]', '2026-09-15', 'lunch', 7200, 2000, 9200, 'paid', ?, 'Palm Beach', 'FL', ?, ?, 'scheduled', ?, 12, 0, ?, ?)`
    ).run(id, `DGP · ${site.name}`, lat, lng, site.id, T0, T0);
    return id;
  };
  const o1 = order(delray, 26.4588, -80.0961);
  const o2 = order(pompano, 26.2379, -80.1248);
  db.prepare(
    `INSERT INTO contract_order_events (id, site_id, account_id, service_date, order_id, event, headcount, total_cents,
       submitted_by_name, submitted_by_phone, verified, confirmation_no, created_at)
     VALUES ('coe_t1', ?, 'acct_dgp', '2026-09-15', ?, 'created', 12, 9200, 'Coordinator', ?, 1, 'A1', ?)`
  ).run(delray.id, o1, SUBMITTER, T0);
  db.prepare("INSERT INTO routes (id, driver_id, route_date, status, created_at, updated_at) VALUES ('rt_t1', 'stf_owner', '2026-09-15', 'started', ?, ?)").run(T0, T0);
  db.prepare(
    "INSERT INTO route_stops (id, route_id, order_id, seq, status, created_at, updated_at) VALUES ('st_t1', 'rt_t1', ?, 1, 'done', ?, ?), ('st_t2', 'rt_t1', ?, 2, 'pending', ?, ?)"
  ).run(o1, T0, T0, o2, T0, T0);
  return { env, db, delray, pompano, o1, o2 };
}

function stub() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('googleapis')) return new Response(JSON.stringify({ routes: [{ duration: '600s' }] }), { status: 200 });
    return new Response(JSON.stringify({ sid: 'SM' + calls.length }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const texts = (calls) => calls.filter((c) => c.url.includes('api.twilio.com')).map((c) => {
  const p = new URLSearchParams(c.init.body);
  return { to: p.get('To'), body: p.get('Body') };
});

test('a contract stop tells whoever sent the count AND the site contact — in both languages', async () => {
  const { notifyOnTheWay } = await import('../../functions/_lib/notify.js');
  const { env, db, delray, o1 } = await world();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(o1);
  const f = stub();
  try { await notifyOnTheWay(env, order, '12:24 PM'); } finally { f.restore(); }
  const sms = texts(f.calls);
  assert.deepEqual(sms.map((x) => x.to).sort(), [DELRAY_CONTACT, SUBMITTER].sort());
  for (const x of sms) {
    assert.match(x.body, new RegExp(`today's lunch for ${delray.name} is on the way`));
    assert.match(x.body, /Estimated arrival around 12:24 PM/);
    assert.match(x.body, /va en camino/);
    assert.match(x.body, /Reply STOP to opt out/);
  }
});

test('a number that texted STOP is skipped, and a contact ordering for themselves gets one text, not two', async () => {
  const { notifyArrivingSoon } = await import('../../functions/_lib/notify.js');
  const { recordUnsubscribe } = await import('../../functions/_lib/audience.js');
  const { env, db, o1 } = await world();
  await recordUnsubscribe(env, { address: SUBMITTER, channel: 'sms', source: 'reply_stop', reason: 'STOP' });
  let f = stub();
  try { await notifyArrivingSoon(env, db.prepare('SELECT * FROM orders WHERE id = ?').get(o1), '5 minutes'); } finally { f.restore(); }
  assert.deepEqual(texts(f.calls).map((x) => x.to), [DELRAY_CONTACT], 'the opted-out submitter is never texted');

  db.prepare("UPDATE contract_order_events SET submitted_by_phone = ? WHERE id = 'coe_t1'").run(DELRAY_CONTACT);
  db.prepare('DELETE FROM campaign_unsubscribes').run();
  f = stub();
  try { await notifyArrivingSoon(env, db.prepare('SELECT * FROM orders WHERE id = ?').get(o1), '5 minutes'); } finally { f.restore(); }
  assert.equal(texts(f.calls).length, 1);
  assert.match(texts(f.calls)[0].body, /about 5 minutes away from/);
});

test('finishing a delivery tells the NEXT office it is on the way, with an ETA from where the driver just was — never twice', async () => {
  const { advanceToNextStop } = await import('../../functions/_lib/stop_progress.js');
  const { env, db, pompano } = await world();
  let f = stub();
  let r;
  try { r = await advanceToNextStop(env, { routeId: 'rt_t1', origin: { lat: 26.4588, lng: -80.0961 }, atMs: T0 }); } finally { f.restore(); }
  assert.equal(r.advanced, true);
  assert.equal(r.stop_id, 'st_t2');
  const st = db.prepare("SELECT status, on_the_way_at, eta_at FROM route_stops WHERE id = 'st_t2'").get();
  assert.equal(st.status, 'en_route');
  assert.equal(st.on_the_way_at, T0);
  assert.equal(st.eta_at, T0 + 600000, 'ten minutes from the stop that was just delivered');
  const sms = texts(f.calls);
  assert.equal(sms.length, 1);
  assert.equal(sms[0].to, POMPANO_CONTACT);
  assert.match(sms[0].body, new RegExp(`${pompano.name} is on the way`));
  assert.match(sms[0].body, /Estimated arrival around/);

  f = stub();
  try { r = await advanceToNextStop(env, { routeId: 'rt_t1', origin: null, atMs: T0 + 1000 }); } finally { f.restore(); }
  assert.equal(r.advanced, false);
  assert.equal(texts(f.calls).length, 0, 'the next office is told once');
});

test('with no known position the next office is still told — but no time is invented', async () => {
  const { advanceToNextStop } = await import('../../functions/_lib/stop_progress.js');
  const { env } = await world();
  const f = stub();
  try { await advanceToNextStop(env, { routeId: 'rt_t1', origin: { lat: null, lng: null }, atMs: T0 }); } finally { f.restore(); }
  assert.equal(f.calls.filter((c) => c.url.includes('googleapis')).length, 0, 'a missing coordinate is not the equator');
  const sms = texts(f.calls);
  assert.equal(sms.length, 1);
  assert.doesNotMatch(sms[0].body, /Estimated arrival/);
});

test('five minutes out the office is told once, from the server clock — with the phone sitting in Maps', async () => {
  const { runApproachingSweep } = await import('../../functions/_lib/stop_progress.js');
  const { env, db, pompano } = await world();
  db.prepare("UPDATE route_stops SET status = 'en_route', on_the_way_at = ?, eta_at = ? WHERE id = 'st_t2'").run(T0, T0 + 12 * 60000);
  let f = stub();
  try { assert.equal((await runApproachingSweep(env, { atMs: T0 })).sent, 0, 'twelve minutes out is too early'); } finally { f.restore(); }

  f = stub();
  let r;
  try { r = await runApproachingSweep(env, { atMs: T0 + 8 * 60000 }); } finally { f.restore(); }
  assert.equal(r.sent, 1);
  const sms = texts(f.calls);
  assert.equal(sms.length, 1);
  assert.match(sms[0].body, new RegExp(`about 4 minutes away from ${pompano.name}`));
  assert.equal(db.prepare("SELECT status FROM route_stops WHERE id = 'st_t2'").get().status, 'arriving');

  f = stub();
  try { assert.equal((await runApproachingSweep(env, { atMs: T0 + 9 * 60000 })).sent, 0, 'never twice'); } finally { f.restore(); }
});

test('a sweep that missed its window stays silent rather than saying "about 1 minute" twenty minutes late', async () => {
  const { runApproachingSweep } = await import('../../functions/_lib/stop_progress.js');
  const { env, db } = await world();
  db.prepare("UPDATE route_stops SET status = 'en_route', on_the_way_at = ?, eta_at = ? WHERE id = 'st_t2'").run(T0, T0);
  const f = stub();
  try { assert.equal((await runApproachingSweep(env, { atMs: T0 + 20 * 60000 })).sent, 0); } finally { f.restore(); }
  assert.equal(texts(f.calls).length, 0);
});

test('the delivery-complete endpoint really advances the route — wired, not merely present', async () => {
  const { onRequestPost } = await import('../../functions/api/hub/driver/delivery/complete.js');
  const { OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  const { env, db, delray, pompano, o1 } = await world();
  db.prepare("UPDATE route_stops SET status = 'en_route' WHERE id = 'st_t1'").run();
  const pending = [];
  const f = stub();
  try {
    const res = await onRequestPost({
      env, waitUntil: (p) => pending.push(p),
      request: new Request('https://anejo.test/api/hub/driver/delivery/complete', {
        method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: o1, stop_id: 'st_t1', geo: { lat: 26.4588, lng: -80.0961 } }),
      }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    await Promise.all(pending);
  } finally { f.restore(); }
  assert.equal(db.prepare("SELECT status FROM route_stops WHERE id = 'st_t1'").get().status, 'done');
  assert.equal(db.prepare("SELECT status FROM route_stops WHERE id = 'st_t2'").get().status, 'en_route');
  const bodies = texts(f.calls).map((x) => x.body);
  assert.ok(bodies.some((b) => new RegExp(`delivered to ${delray.name}`).test(b)), 'the office just served is told its lunch arrived');
  assert.ok(bodies.some((b) => new RegExp(`${pompano.name} is on the way`).test(b)), 'and the next office that it is coming');
});
