// The 2026-08-04 incident: a customer was texted "Estimated arrival around 6:58 PM" for a
// driver who was 3 minutes away. Root cause: stop.js's fromPoint() silently substituted the
// kitchen for the driver's actual (unknown) position, and Google dutifully computed a real
// ~35-minute kitchen->customer drive time, which got stated as if it meant something.
//
// The fix: a precise ETA (a clock time, or "N minutes") may only be computed/stated when it
// comes from a real, fresh driver GPS fix. No fresh fix → no number at all, anywhere — not a
// wider number, not a hedge, just true and vague copy ("on the way", "close by"). These tests
// pin that rule at both places a number could leak to a customer: the endpoint that decides
// WHETHER to compute one (stop.js) and the copy that's sent when one isn't available (notify.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeKV } from '../helpers/d1.js';
import { notifyOnTheWay, notifyArrivingSoon } from '../../functions/_lib/notify.js';

const { onRequestPost } = await import('../../functions/api/hub/driver/stop.js');

// ---------------------------------------------------------------------------
// notify.js — the copy itself must never manufacture a number
// ---------------------------------------------------------------------------

function smsEnv() {
  const bodies = [];
  const DB = makeD1([[/INSERT INTO sms_log/, ({ args }) => { bodies.push(args[5]); return 1; }]]);
  return { env: { DB }, bodies };
}
const CONSENTED_ORDER = { customer_name: 'Sam', customer_phone: '+15615550100', sms_consent: 1 };

test('notifyOnTheWay with no etaText sends true, vague copy — never a fabricated time', async () => {
  const { env, bodies } = smsEnv();
  await notifyOnTheWay(env, CONSENTED_ORDER, null);
  assert.equal(bodies.length, 1);
  assert.doesNotMatch(bodies[0], /Estimated arrival around/);
  assert.match(bodies[0], /we'll text you when the driver is a few minutes out/i);
});

test('notifyOnTheWay states the ETA when one was actually computed', async () => {
  const { env, bodies } = smsEnv();
  await notifyOnTheWay(env, CONSENTED_ORDER, '6:58 PM');
  assert.match(bodies[0], /Estimated arrival around 6:58 PM/);
});

test('notifyArrivingSoon with no etaText says "close by" — never invents a minute count', async () => {
  // The old default was `etaText || '10 minutes'` — a driver tapping the manual button with no
  // usable position would still tell the customer a precise-sounding "about 10 minutes" that had
  // no basis. That fabricated default is the bug; this pins its removal.
  const { env, bodies } = smsEnv();
  await notifyArrivingSoon(env, CONSENTED_ORDER, null);
  assert.doesNotMatch(bodies[0], /10 minutes/);
  assert.match(bodies[0], /close by/i);
});

test('notifyArrivingSoon states the ETA when one was actually computed', async () => {
  const { env, bodies } = smsEnv();
  await notifyArrivingSoon(env, CONSENTED_ORDER, '8 minutes');
  assert.match(bodies[0], /about 8 minutes away/);
});

// ---------------------------------------------------------------------------
// stop.js — deciding WHETHER a number may be computed at all
// ---------------------------------------------------------------------------

const TOKEN = 'tok_driver_1';
const ROUTE_ID = 'rt_1';
const STOP_ID = 'stp_1';

// Swap global.fetch for the duration of one test; restore unconditionally after.
function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(calls.length, String(url), init); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const routesApiOk = (seconds) => new Response(JSON.stringify({ routes: [{ duration: `${seconds}s` }] }), { status: 200 });

function stopEnv({ route, smsBodies }) {
  const DB = makeD1([
    [/FROM staff WHERE id=\?/, () => ({ id: 'stf_1', role: 'driver', active: 1, name: 'Driver One' })],
    [/SELECT \* FROM routes WHERE driver_id=\? AND route_date=\?/, () => route],
    [/SELECT rs\.\*, o\.\* , rs\.id AS stop_id/, () => ({
      stop_id: STOP_ID, id: STOP_ID, route_id: ROUTE_ID, seq: 1,
      order_id: 'ord_1', customer_name: 'Sam', customer_phone: '+15615550100', sms_consent: 1,
      delivery_lat: 26.7153, delivery_lng: -80.0534, arriving_at: null,
    })],
    [/UPDATE route_stops SET status='en_route'/, () => 1],
    [/UPDATE routes SET current_seq=\?/, () => 1],
    [/INSERT INTO sms_log/, ({ args }) => { smsBodies.push(args[5]); return 1; }],
  ]);
  const SESSIONS = makeKV({
    [`session:${TOKEN}`]: JSON.stringify({
      type: 'staff', role: 'driver', uid: 'stf_1', team: null, email: 'd@x.test',
      la: Date.now(), created: Date.now(),
    }),
  });
  return { DB, SESSIONS, GOOGLE_MAPS_API_KEY: 'test-key' };
}

function navStart(env) {
  return onRequestPost({
    request: new Request('https://anejocateringco.com/api/hub/driver/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `anejo_sess=${TOKEN}` },
      body: JSON.stringify({ stop_id: STOP_ID, action: 'nav_start' }),
    }),
    env,
    waitUntil: () => {}, // Cloudflare Pages Functions context — no-op is fine, we await below.
  });
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('a fresh driver GPS fix (<5 min old) produces a real ETA and states it to the customer', async () => {
  const route = {
    id: ROUTE_ID, driver_id: 'stf_1', route_date: '2026-08-04', status: 'started',
    driver_lat: 26.3683, driver_lng: -80.1289, driver_loc_at: Date.now() - 60000, // 1 min old
  };
  const smsBodies = [];
  const env = stopEnv({ route, smsBodies });
  const fetchStub = stubFetch(() => routesApiOk(180)); // 3 minutes
  try {
    const res = await navStart(env);
    const body = await res.json();
    await tick();
    assert.equal(body.ok, true);
    assert.ok(body.eta_clock, 'a confident position must produce a stated ETA');
    assert.equal(fetchStub.calls.length, 1, 'the ETA must be computed from the real position');
    assert.equal(smsBodies.length, 1);
    assert.match(smsBodies[0], /Estimated arrival around/);
  } finally { fetchStub.restore(); }
});

test('no fresh fix (never pinged) never computes or states an ETA — no guess, no fetch at all', async () => {
  const route = {
    id: ROUTE_ID, driver_id: 'stf_1', route_date: '2026-08-04', status: 'assigned',
    driver_lat: null, driver_lng: null, driver_loc_at: null,
  };
  const smsBodies = [];
  const env = stopEnv({ route, smsBodies });
  const fetchStub = stubFetch(() => routesApiOk(2100)); // would be the ~35-min kitchen drive
  try {
    const res = await navStart(env);
    const body = await res.json();
    await tick();
    assert.equal(body.ok, true);
    assert.equal(body.eta_clock, null, 'no confident position → no stated ETA, not a wrong one');
    assert.equal(fetchStub.calls.length, 0, 'must not even ask Google from a guessed origin');
    assert.equal(smsBodies.length, 1);
    assert.doesNotMatch(smsBodies[0], /Estimated arrival around/, 'this is the exact 2026-08-04 failure');
    assert.match(smsBodies[0], /we'll text you when the driver is a few minutes out/i);
  } finally { fetchStub.restore(); }
});

test('a stale fix (>5 min old) is treated the same as no fix at all', async () => {
  const route = {
    id: ROUTE_ID, driver_id: 'stf_1', route_date: '2026-08-04', status: 'started',
    driver_lat: 26.3683, driver_lng: -80.1289, driver_loc_at: Date.now() - 6 * 60000, // 6 min old
  };
  const smsBodies = [];
  const env = stopEnv({ route, smsBodies });
  const fetchStub = stubFetch(() => routesApiOk(2100));
  try {
    const res = await navStart(env);
    const body = await res.json();
    await tick();
    assert.equal(body.eta_clock, null);
    assert.equal(fetchStub.calls.length, 0);
    assert.doesNotMatch(smsBodies[0], /Estimated arrival around/);
  } finally { fetchStub.restore(); }
});
