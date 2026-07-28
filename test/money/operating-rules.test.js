// Operating rules the owner sets: service area, delivery days, order-by deadline, closures.
//
// All of it was hardcoded — a literal `if (dt.getDay() === 0) continue;` for "no Sunday", the
// deadline written into the markup as text, window times inside an <option>.
//
// One of these is a BUG FIX, not a setting: the service area was never enforced. The code said
// "we deliver within Palm Beach County" in a comment while checkout accepted ANY 5-digit ZIP —
// which is how a real order arrived from Miami (33169).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, deliveryDays, isClosed, scheduleOpenFor, zipAllowed, tempOverride, describe,
} from '../../functions/_lib/operating.js';

const ops = (over) => Object.assign({}, DEFAULTS, over);

// ---- service area ----

test('an empty area setting stays UNRESTRICTED — deploying this rejects nobody', () => {
  // Defaulting to a guessed ZIP list would start turning away real customers the moment it ships.
  const r = zipAllowed(ops(), '90210');
  assert.equal(r.ok, true);
  assert.equal(r.unrestricted, true);
});

test('a 3-digit prefix covers a whole county', () => {
  const o = ops({ service_zips: '334' });                  // Palm Beach County
  assert.equal(zipAllowed(o, '33445').ok, true, 'Delray');
  assert.equal(zipAllowed(o, '33401').ok, true, 'West Palm');
  assert.equal(zipAllowed(o, '33169').ok, false, 'Miami — the order that should never have been taken');
});

test('adding Broward is one more prefix', () => {
  const o = ops({ service_zips: '334,330,333' });
  assert.equal(zipAllowed(o, '33445').ok, true, 'Palm Beach');
  assert.equal(zipAllowed(o, '33301').ok, true, 'Fort Lauderdale');
  assert.equal(zipAllowed(o, '90210').ok, false, 'still not California');
});

test('full ZIPs and prefixes can be mixed', () => {
  const o = ops({ service_zips: '334, 33019' });
  assert.equal(zipAllowed(o, '33019').ok, true, 'the one exact ZIP');
  assert.equal(zipAllowed(o, '33018').ok, false, 'a neighbour is not included');
});

test('a malformed ZIP is refused once an area is set', () => {
  const o = ops({ service_zips: '334' });
  assert.equal(zipAllowed(o, 'abcde').ok, false);
  assert.equal(zipAllowed(o, '').ok, false);
});

// ---- delivery days ----

test('the default is Mon–Sat, matching the rule it replaced', () => {
  assert.deepEqual(deliveryDays(ops()), [1, 2, 3, 4, 5, 6]);
  assert.ok(!deliveryDays(ops()).includes(0), 'no Sunday, as hardcoded before');
});

test('Sunday can be added', () => {
  assert.ok(deliveryDays(ops({ delivery_days: '0,1,2,3,4,5,6' })).includes(0));
});

test('an empty or garbage day list falls back rather than closing the business', () => {
  assert.deepEqual(deliveryDays(ops({ delivery_days: '' })), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(deliveryDays(ops({ delivery_days: 'x,y' })), [1, 2, 3, 4, 5, 6]);
});

// ---- deadline + closures ----

const at = (iso) => new Date(iso);

test('before the deadline, tomorrow is orderable', () => {
  // Wed 2026-07-29 17:00 ET → ordering for Thu 07-30
  const r = scheduleOpenFor(ops(), '2026-07-30', at('2026-07-29T21:00:00Z'));
  assert.equal(r.ok, true);
});

test('after the 6 PM deadline, the next day closes', () => {
  const r = scheduleOpenFor(ops(), '2026-07-30', at('2026-07-29T23:00:00Z')); // 19:00 ET
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'past_deadline');
});

test('the deadline only affects the NEXT day — further out stays open', () => {
  const r = scheduleOpenFor(ops(), '2026-07-31', at('2026-07-29T23:00:00Z'));
  assert.equal(r.ok, true, 'Friday is still orderable after Wednesday 7 PM');
});

test('a non-delivery weekday is refused', () => {
  const r = scheduleOpenFor(ops(), '2026-08-02', at('2026-07-29T14:00:00Z')); // a Sunday
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_delivery_day');
});

test('a closed date is refused even on a normal delivery day', () => {
  const o = ops({ closed_dates: '2026-07-30' });
  assert.equal(isClosed(o, '2026-07-30'), true);
  assert.equal(scheduleOpenFor(o, '2026-07-30', at('2026-07-29T14:00:00Z')).reason, 'closed');
});

// ---- temporary override ----

test('a temporary window expires on its own', () => {
  const future = Date.now() + 3600000;
  assert.equal(tempOverride(ops({ temp_open_until: String(future) })).active, true);
  const past = Date.now() - 1000;
  assert.equal(tempOverride(ops({ temp_open_until: String(past) })).active, false,
    'nobody has to remember to switch it back off');
});

test('no override set means no override', () => {
  assert.equal(tempOverride(ops()).active, false);
});

// ---- the owner-facing summary ----

test('the summary names the unrestricted area explicitly', () => {
  assert.match(describe(ops()).area, /Unrestricted/i, 'the owner must be told, not left to infer');
  assert.match(describe(ops({ service_zips: '334,330' })).area, /2 ZIP/);
});
