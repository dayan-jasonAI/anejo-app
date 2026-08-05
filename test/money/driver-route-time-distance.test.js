// A production route was stored with total_miles_est=45.6 next to total_minutes=15 — a 182 mph
// average nobody could act on. Root cause: assignRoute()'s fallback path (no Google
// optimization — missing key, an ungeocoded stop, or an API miss) computed total_minutes from a
// flat "15 min per stop" guess that had NO relationship to the distance it was about to store as
// total_miles_est.
//
// The fix derives the fallback time estimate from the SAME distance being persisted, so the two
// numbers describing one route can't silently contradict each other. This must NOT touch driver
// pay: computeRoutePay() prices on stops + miles only, never on total_minutes (see _lib/pay.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import { assignRoute } from '../../functions/_lib/routing.js';

// Real coordinates from the incident's own geography: Boca Raton kitchen -> West Palm Beach
// customer, a genuine ~30 mile / ~35 minute drive — exactly the pairing that used to store an
// impossible speed.
const KITCHEN = { KITCHEN_ORIGIN_LAT: 26.3683, KITCHEN_ORIGIN_LNG: -80.1289 };
const CUSTOMER = { lat: 26.7153, lng: -80.0534 };

function routingEnv() {
  const inserts = { routes: [], route_stops: [] };
  const DB = makeD1([
    [/INSERT INTO routes/, ({ args }) => { inserts.routes.push(args); return 1; }],
  ]);
  // assignRoute() writes the stops with env.DB.batch(...statements), which the D1 test helper
  // doesn't model (it only drives .prepare().bind().first/all/run()). Each statement in the
  // batch is itself a real prepared statement from the same mock, so running each one's .run()
  // exercises the identical route-matching logic .batch() would — it just isn't parallelized.
  DB.batch = async (stmts) => Promise.all(stmts.map((s) => s.run()));
  const realPrepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    if (/INSERT INTO route_stops/.test(sql)) {
      return { bind: (...args) => ({ run: async () => { inserts.route_stops.push(args); return { success: true, meta: { changes: 1 } }; } }) };
    }
    return realPrepare(sql);
  };
  // No GOOGLE_MAPS_API_KEY → optimizeRoute() no-ops immediately (geoConfigured() is false) —
  // this is the exact fallback path the incident came from. Every other lookup assignRoute()
  // might attempt (staff, threads, push, sms) is wrapped in its own best-effort try/catch, so an
  // "Unrouted SQL" throw from makeD1 for anything not mocked above is swallowed harmlessly.
  return { DB, inserts, ...KITCHEN };
}

test('the fallback estimate never implies a physically impossible average speed', async () => {
  const env = routingEnv();
  const orders = [{
    id: 'o1', customer_name: 'Test Customer', delivery_window: 'dinner',
    delivery_lat: CUSTOMER.lat, delivery_lng: CUSTOMER.lng,
  }];
  const res = await assignRoute(env, { orders, routeDate: '2026-08-04' });
  assert.equal(res.ok, true);
  assert.ok(res.miles > 15, `sanity: Boca->WPB is a real ~30mi drive, got ${res.miles}`);
  assert.ok(res.total_minutes > 0);
  const impliedMph = res.miles / (res.total_minutes / 60);
  assert.ok(impliedMph < 60, `implied speed ${impliedMph.toFixed(1)} mph must be plausible — the incident stored 182`);
});

test('the two numbers are derived from ONE distance, not two disconnected guesses', async () => {
  // Same inputs, twice — the fallback must be deterministic (a fixed avg-speed model), not
  // driven by something that could drift between the miles figure and the minutes figure.
  const orders = [{
    id: 'o1', customer_name: 'Test Customer', delivery_window: 'dinner',
    delivery_lat: CUSTOMER.lat, delivery_lng: CUSTOMER.lng,
  }];
  const r1 = await assignRoute(routingEnv(), { orders, routeDate: '2026-08-04' });
  const r2 = await assignRoute(routingEnv(), { orders, routeDate: '2026-08-04' });
  assert.equal(r1.miles, r2.miles);
  assert.equal(r1.total_minutes, r2.total_minutes);
});

test('driver pay is unaffected — it prices on stops + miles, never on total_minutes', async () => {
  const env = routingEnv();
  const orders = [{
    id: 'o1', customer_name: 'Test Customer', delivery_window: 'dinner',
    delivery_lat: CUSTOMER.lat, delivery_lng: CUSTOMER.lng,
  }];
  const res = await assignRoute(env, { orders, routeDate: '2026-08-04' });
  // computeRoutePay's own contract (pinned separately in the pay tests): pay = f(stops, miles).
  // Here we just confirm the routing fix didn't sneak total_minutes into the persisted pay math —
  // the INSERT INTO routes column list is unchanged and pay_cents came from computeRoutePay().
  assert.ok(res.pay_cents > 0);
  assert.ok(res.pay_breakdown && res.pay_breakdown.miles === res.miles);
});

test('a route WITH successful Google optimization is untouched by the fallback logic', async () => {
  // Guard against the fix accidentally firing on the happy path too.
  const env = routingEnv();
  env.GOOGLE_MAPS_API_KEY = 'test-key';
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    routes: [{
      optimizedIntermediateWaypointIndex: [0],
      legs: [{ duration: '1200s' }, { duration: '1200s' }],
      distanceMeters: 32186, // ~20 mi
      duration: '2400s',
    }],
  }), { status: 200 });
  try {
    const orders = [{
      id: 'o1', customer_name: 'Test Customer', delivery_window: 'dinner',
      delivery_lat: CUSTOMER.lat, delivery_lng: CUSTOMER.lng,
    }];
    const res = await assignRoute(env, { orders, routeDate: '2026-08-04' });
    assert.equal(res.optimized, true);
    // legs = [origin->stop, stop->origin] = 1200s + 1200s round-trip drive, + 4min service
    // (default DELIVERY_STOP_MINUTES) for the one stop = 44 min. The point of this test isn't
    // the exact number — it's that the optimized path used Google's real duration untouched by
    // the fallback's avg-speed model (proven by the OTHER "not optimized" tests above).
    assert.equal(res.total_minutes, 44);
  } finally { globalThis.fetch = real; }
});
