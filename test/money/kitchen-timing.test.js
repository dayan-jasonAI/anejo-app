// The kitchen clock (Dayan, 2026-09-15): each menu item has a prep time, and the kitchen sees when to
// start an order and how long it has been cooking, "so the food is done at the right time".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTiming, validateTiming, loadKitchenTiming, labelStartMinutes, TIMING_DEFAULTS } from '../../functions/_lib/kitchen-timing.js';

const MIN = 60000;
const prepById = new Map([['vida', 20], ['fuego', 45]]);
const web = (patch = {}) => ({ id: 'ord_1', status: 'paid', delivery_date: '2026-09-16', delivery_window: 'lunch', ...patch });

test('an order takes as long as its slowest item, and ready-by is the window start minus the lead, in Eastern time', () => {
  const items = [{ id: 'vida', name: 'VIDA', qty: 3 }, { id: 'fuego', name: 'FUEGO', qty: 2 }];
  const t = orderTiming({ order: web(), items, prepById, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(t.estimate_minutes, 45, 'the rice and the steak cook side by side: not 20 + 45');
  assert.equal(t.ready_by_at, Date.parse('2026-09-16T14:30:00Z'), '11:00 EDT window, ready 30 minutes before');
  assert.equal(t.start_by_at, Date.parse('2026-09-16T13:45:00Z'), 'start 45 minutes before that: 9:45 AM');
  assert.deepEqual(t.missing, []);

  const november = orderTiming({ order: web({ delivery_date: '2026-11-02' }), items, prepById, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(november.ready_by_at, Date.parse('2026-11-02T15:30:00Z'), 'after the clocks change it is still 10:30 local');

  const dinner = orderTiming({ order: web({ delivery_window: 'dinner' }), items, prepById, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(dinner.ready_by_at, Date.parse('2026-09-16T20:30:00Z'));
});

test('before prep the order says upcoming, start now, then late; during prep it counts down, then runs over', () => {
  const items = [{ id: 'fuego', name: 'FUEGO' }];
  const startBy = Date.parse('2026-09-16T13:45:00Z');
  const at = (atMs, patch) => orderTiming({ order: web(patch), items, prepById, timing: TIMING_DEFAULTS, atMs }).state;
  assert.equal(at(startBy - 10 * MIN), 'upcoming');
  assert.equal(at(startBy + 1 * MIN), 'start_now');
  assert.equal(at(startBy + 6 * MIN), 'late');

  const started = Date.parse('2026-09-16T13:40:00Z');
  const cooking = orderTiming({ order: web({ status: 'prep', prep_started_at: started }), items, prepById, timing: TIMING_DEFAULTS, atMs: started + 10 * MIN });
  assert.equal(cooking.state, 'cooking');
  assert.equal(cooking.due_at, started + 45 * MIN);
  assert.equal(at(started + 50 * MIN, { status: 'prep', prep_started_at: started }), 'over');
  assert.equal(at(started, { status: 'ready' }), 'ready');
});

test('no estimate means no timer, and the kitchen is told which item has none: nothing is invented', () => {
  const t = orderTiming({ order: web(), items: [{ id: 'vida', name: 'VIDA' }, { id: 'coco', name: 'COCO' }], prepById, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(t.estimate_minutes, 20, 'what IS known still counts');
  assert.deepEqual(t.missing, ['COCO']);

  const none = orderTiming({ order: web(), items: [{ id: 'coco', name: 'COCO' }], prepById, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(none.estimate_minutes, null);
  assert.equal(none.start_by_at, null);
  assert.equal(none.state, 'not_set');
  assert.ok(none.ready_by_at, 'ready-by does not need an estimate');

  const started = orderTiming({ order: web({ status: 'prep', prep_started_at: 1000 }), items: [{ id: 'coco' }], prepById, timing: TIMING_DEFAULTS, atMs: 5000 });
  assert.equal(started.state, 'cooking_no_estimate');
  assert.equal(started.due_at, null);
});

test('an office order uses the office estimate and its own site window', () => {
  const office = { ...web(), contract_site_id: 'site_1' };
  const timing = { ...TIMING_DEFAULTS, office_prep_minutes: 60 };
  const t = orderTiming({ order: office, items: [{ id: 'contract_lunch', name: 'Office lunch', qty: 20 }], siteLabel: '11:30–12:30', timing, atMs: 0 });
  assert.equal(t.estimate_minutes, 60);
  assert.equal(t.ready_by_at, Date.parse('2026-09-16T15:00:00Z'), 'site opens 11:30 EDT, ready 30 minutes before');
  assert.equal(t.start_by_at, Date.parse('2026-09-16T14:00:00Z'));

  const unset = orderTiming({ order: office, items: [], siteLabel: null, timing: TIMING_DEFAULTS, atMs: 0 });
  assert.equal(unset.estimate_minutes, null);
  assert.deepEqual(unset.missing, ['Office lunch']);
  assert.equal(unset.ready_by_at, Date.parse('2026-09-16T14:30:00Z'), 'no site window: the lunch default');

  assert.equal(labelStartMinutes('12:15 PM – 1:00 PM'), 735);
  assert.equal(labelStartMinutes('12:05am'), 5);
  assert.equal(labelStartMinutes('lunch'), null);
});

test('timing settings are validated, and a bad stored value falls back instead of breaking the board', async () => {
  assert.deepEqual(validateTiming({ lunch_start: '25:00' }).errors.length, 1);
  assert.deepEqual(validateTiming({ ready_lead_minutes: '' }).errors.length, 1, 'the lead is required');
  assert.deepEqual(validateTiming({ office_prep_minutes: '' }).values, { office_prep_minutes: null }, 'the office estimate may be blank');
  assert.equal(validateTiming({ office_prep_minutes: 2.5 }).errors.length, 1);

  const rows = [
    { key: 'kitchen.lunch_start', value: '"11:15"' },
    { key: 'kitchen.dinner_start', value: 'not a time' },
    { key: 'kitchen.ready_lead_minutes', value: '20' },
    { key: 'kitchen.unrelated', value: '"x"' },
  ];
  const env = { DB: { prepare: () => ({ all: async () => ({ results: rows }) }) } };
  assert.deepEqual(await loadKitchenTiming(env), { lunch_start: '11:15', dinner_start: '17:00', ready_lead_minutes: 20, office_prep_minutes: null });
  const broken = { DB: { prepare: () => ({ all: async () => { throw new Error('no table'); } }) } };
  assert.deepEqual(await loadKitchenTiming(broken), { ...TIMING_DEFAULTS });
});
