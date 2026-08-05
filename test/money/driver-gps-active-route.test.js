// GPS acceptance is no longer gated on routes.status='started' (functions/api/hub/driver/
// location.js). Root cause of the 2026-08-04 incident: drivers routinely skip the pickup-
// confirmation step and tap "Mark delivered" directly, so routes.status never flips to
// 'started'. Gating GPS acceptance on that status meant driver_lat/driver_lng stayed NULL for
// the whole shift, and stop.js's fromPoint() fell back to the kitchen — a driver 3 minutes from
// the customer got quoted a ~35-minute kitchen-origin drive time.
//
// The fix widens acceptance to "any route today that isn't finished" — assigned or started —
// while still excluding completed/canceled routes (the job is over) and a route still sitting on
// a pending offer (the driver hasn't taken the job yet). These tests pin both the observable
// behavior and the literal SQL, because the SQL text IS the fix here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1, makeKV } from '../helpers/d1.js';

const { onRequestPost } = await import('../../functions/api/hub/driver/location.js');
const SRC = readFileSync(new URL('../../functions/api/hub/driver/location.js', import.meta.url), 'utf8');

const TOKEN = 'tok_driver_1';

function driverEnv(routeRow, extra = {}) {
  const updates = [];
  const DB = makeD1([
    [/FROM staff WHERE id=\?/, () => ({ id: 'stf_1', role: 'driver', active: 1, name: 'Driver One' })],
    [/SELECT \* FROM routes WHERE driver_id=\? AND route_date=\?/, () => routeRow],
    [/UPDATE routes SET driver_lat=\?, driver_lng=\?, driver_loc_at=\?/, ({ args }) => { updates.push(args); return 1; }],
    [/FROM route_stops rs JOIN orders/, () => null],
  ]);
  const SESSIONS = makeKV({
    [`session:${TOKEN}`]: JSON.stringify({
      type: 'staff', role: 'driver', uid: 'stf_1', team: null, email: 'd@x.test',
      la: Date.now(), created: Date.now(),
    }),
  });
  return { DB, SESSIONS, updates, ...extra };
}

function postLocation(env) {
  return onRequestPost({
    request: new Request('https://anejocateringco.com/api/hub/driver/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `anejo_sess=${TOKEN}` },
      body: JSON.stringify({ lat: 26.71, lng: -80.05, acc: 12 }),
    }),
    env,
  });
}

for (const status of ['assigned', 'started']) {
  test(`a '${status}' route accepts a GPS ping — acceptance no longer requires 'started'`, async () => {
    const env = driverEnv({ id: 'rt_1', driver_id: 'stf_1', route_date: '2026-08-04', status, offer_status: 'accepted' });
    const res = await postLocation(env);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(env.updates.length, 1, 'driver_lat/lng must be written for an assigned-not-started route');
  });
}

test('no active route (null from the lookup) records no position, but still answers ok', () => {
  // A finished route (completed/canceled) or one still on a pending offer is excluded by the
  // real SQL (pinned below); simulating that exclusion as "lookup found nothing" is what every
  // caller of activeRoute() actually sees.
  return (async () => {
    const env = driverEnv(null);
    const res = await postLocation(env);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.route, null);
    assert.equal(env.updates.length, 0);
  })();
});

test('the query excludes completed/canceled and a pending offer — not "status=\'started\'"', () => {
  // Isolate the actual SQL literal (not the surrounding comments, which describe the old
  // behavior in prose) so this pins the query text itself, not incidental wording nearby.
  const sqlStart = SRC.indexOf('SELECT * FROM routes WHERE driver_id');
  const sql = SRC.slice(sqlStart, SRC.indexOf(';', sqlStart));
  assert.doesNotMatch(sql, /status='started'/, 'the old status-gated query must be gone');
  assert.match(sql, /status NOT IN \('completed','canceled'\)/);
  assert.match(sql, /offer_status/, 'a route still on a pending offer must not be tracked yet');
});
