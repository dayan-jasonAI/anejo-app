// The adult day care program as HUB data: the cycle the kitchen cooks from, the scaling that puts
// today's head count on a recipe written for 45, the delivery slip, and the one rule every AI
// surface must obey — an unsigned menu is never described as approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { slotFor, scaleQty, scaleRecipe, purchaseList, programContext, activeCycle } from '../../functions/_lib/program.js';
import { onRequestGet as programGet, onRequestPost as programPost } from '../../functions/api/hub/kitchen/program.js';
import { CURRENT_VERSION, UPDATES, updateFor } from '../../functions/_lib/training_modules.js';

const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, {
  ...init, headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE, ...(init.headers || {}) },
});

function seedSite(env, { id = 'csite_adc', name = 'Boca Raton Adult Daycare', started = '2026-10-05', headcount = null, date = null } = {}) {
  env.DB.sqlite.prepare(
    `INSERT INTO contract_sites (id, account_id, name, street, city, state, zip, delivery_days, price_per_lunch_cents,
       cutoff_time, active, created_at, updated_at, program_cycle_id, program_started_on)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`
  ).run(id, 'acct_dgp', name, '2120 N Dixie Hwy', 'Boca Raton', 'FL', '33431', 'mon,tue,wed,thu,fri', 995, '09:00',
    Date.now(), Date.now(), 'pcyc_adc4', started);
  if (headcount != null && date) {
    env.DB.sqlite.prepare(
      'INSERT INTO contract_orders (id, site_id, account_id, service_date, headcount, total_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run('cord_t1', id, 'acct_dgp', date, headcount, headcount * 995, Date.now(), Date.now());
  }
  return id;
}

test('the cycle walks in weeks, not in service days, so a holiday cannot shift the menu forever', () => {
  const start = '2026-10-05';                 // a Monday
  assert.deepEqual(slotFor('2026-10-05', { startedOn: start }), { week: 1, dow: 1, dow_key: 'mon' });
  assert.deepEqual(slotFor('2026-10-09', { startedOn: start }), { week: 1, dow: 5, dow_key: 'fri' });
  assert.deepEqual(slotFor('2026-10-12', { startedOn: start }), { week: 2, dow: 1, dow_key: 'mon' });
  assert.deepEqual(slotFor('2026-11-02', { startedOn: start }), { week: 1, dow: 1, dow_key: 'mon' }, 'wraps after 4 weeks');
  // A closed Monday does not renumber Tuesday: the date still knows its own slot.
  assert.deepEqual(slotFor('2026-10-13', { startedOn: start }), { week: 2, dow: 2, dow_key: 'tue' });
  assert.equal(slotFor('2026-10-10', { startedOn: start }), null, 'Saturday is not a service day');
  assert.equal(slotFor('not-a-date', { startedOn: start }), null);
  // A contract that starts mid-week still gets a whole week 1.
  assert.deepEqual(slotFor('2026-10-09', { startedOn: '2026-10-07' }), { week: 1, dow: 5, dow_key: 'fri' });
});

test('quantities scale from the 45-portion basis, and a quantity with no number is left alone', () => {
  assert.equal(scaleQty('12 lb raw', 45), '12 lb raw');
  assert.equal(scaleQty('12 lb raw', 22), '5.75 lb raw');
  assert.equal(scaleQty('6 cups', 30), '4 cups');
  assert.equal(scaleQty('4 dozen', 45), '4 dozen');
  assert.equal(scaleQty('½ cup', 45), '0.5 cup');
  assert.equal(scaleQty('one set', 22), 'one set', 'no invented number');
  assert.equal(scaleQty('per mix', 22), 'per mix');
  assert.equal(scaleQty('none added', 22), 'none added');
});

test('a scaled recipe keeps the original quantity beside the scaled one, in the cook’s language', () => {
  const r = {
    name: 'Pollo guisado', name_es: 'Pollo guisado',
    ingredients: [{ item: 'Boneless skinless chicken thigh', qty: '12 lb raw' }],
    ingredients_es: [{ item: 'Muslo de pollo sin hueso ni piel', qty: '12 lb crudas' }],
    steps: ['Sear'], steps_es: ['Selle'],
  };
  const en = scaleRecipe(r, 22, 'en');
  assert.equal(en.ingredients[0].qty, '5.75 lb raw');
  assert.equal(en.ingredients[0].qty_basis, '12 lb raw', 'the 45-portion basis stays visible');
  const es = scaleRecipe(r, 22, 'es');
  assert.equal(es.ingredients[0].item, 'Muslo de pollo sin hueso ni piel');
  assert.deepEqual(es.steps, ['Selle']);
});

test('the kitchen screen shows the day’s meals, the center’s count, and the recipe scaled to it', async () => {
  const env = ownerEnv();
  const date = '2026-10-06';                  // week 1, Tuesday
  seedSite(env, { headcount: 24, date });
  const res = await programGet({ env, request: req(`/api/hub/kitchen/program?date=${date}`) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.sites.length, 1);
  const site = d.sites[0];
  assert.equal(site.headcount, 24);
  assert.equal(site.cycle.week, 1);
  assert.deepEqual(site.items.map((i) => i.meal), ['breakfast', 'lunch', 'snack']);
  const lunch = site.items.find((i) => i.meal === 'lunch');
  assert.ok(lunch.dish, 'a dish is scheduled');
  assert.ok(lunch.components.length >= 4, 'components come from the approved menu');
  assert.ok(lunch.scaled.ingredients.length > 0);
  assert.equal(lunch.scaled.scaled_to, 24);
  const snack = site.items.find((i) => i.meal === 'snack');
  assert.equal(snack.scaled, null, 'snacks are assembly, not a recipe');
});

test('an unsigned cycle is never servable, and the reason is stated rather than implied', async () => {
  const env = ownerEnv();
  const date = '2026-10-06';
  seedSite(env, { headcount: 10, date });
  const before = await activeCycle(env);
  assert.equal(before.servable, false);
  assert.match(before.not_servable_reason, /59A-16\.105/);
  const d = await (await programGet({ env, request: req(`/api/hub/kitchen/program?date=${date}`) })).json();
  assert.equal(d.sites[0].cycle.servable, false);
  assert.ok(d.sites[0].cycle.not_servable_reason);

  env.DB.sqlite.prepare("UPDATE program_cycles SET dietitian_name='George Ateek', dietitian_credentials='RD, CSG, LD', dietitian_license='ND475', reviewed_at=? WHERE id='pcyc_adc4'").run(Date.now());
  const after = await activeCycle(env);
  assert.equal(after.servable, true);
  assert.equal(after.not_servable_reason, null);
});

test('packing and delivery are logged once per meal, and a second save updates that same slip', async () => {
  const env = ownerEnv();
  const date = '2026-10-06';
  const siteId = seedSite(env, { headcount: 24, date });
  const first = await programPost({ env, request: req('/api/hub/kitchen/program', { method: 'POST', body: JSON.stringify({
    op: 'log', site_id: siteId, service_date: date, meal: 'lunch', dish: 'Picadillo', cycle_week: 1, count_delivered: 24, temp_pack_f: 152,
  }) }) });
  assert.equal(first.status, 200);
  const second = await programPost({ env, request: req('/api/hub/kitchen/program', { method: 'POST', body: JSON.stringify({
    op: 'log', site_id: siteId, service_date: date, meal: 'lunch', temp_delivery_f: 141, received_by: 'Patricia F.',
  }) }) });
  assert.equal((await second.json()).updated, true);
  const rows = env.DB.rows('SELECT * FROM program_service_log WHERE site_id = ? AND service_date = ?', siteId, date);
  assert.equal(rows.length, 1, 'one slip per meal, not one per save');
  assert.equal(rows[0].temp_pack_f, 152);
  assert.equal(rows[0].temp_delivery_f, 141);
  assert.equal(rows[0].count_delivered, 24);
  assert.equal(rows[0].received_by, 'Patricia F.');
  const bad = await programPost({ env, request: req('/api/hub/kitchen/program', { method: 'POST', body: JSON.stringify({ op: 'log', site_id: siteId, service_date: date, meal: 'brunch' }) }) });
  assert.equal(bad.status, 400);
});

test('the purchase list aggregates a week of recipes at the head count actually ordered', async () => {
  const env = ownerEnv();
  const list = await purchaseList(env, { weeks: [1], headcount: 22 });
  assert.equal(list.ok, true);
  assert.ok(list.lines.length > 10, `${list.lines.length} ingredient lines`);
  const chicken = list.lines.find((l) => /chicken thigh/i.test(l.item));
  assert.ok(chicken, 'the week 1 chicken dish is in the list');
  assert.ok(chicken.dishes.length >= 1);
  assert.ok(chicken.quantities.every((q) => !/^12 lb/.test(q)), 'quantities are scaled, not the 45-portion basis');
});

test('every AI surface gets the same program facts, and an unsigned menu carries a do-not-say line', async () => {
  const env = ownerEnv();
  const unsigned = await programContext(env);
  assert.match(unsigned, /adult day care/i);
  assert.match(unsigned, /59A-16\.105/);
  assert.match(unsigned, /NOT yet signed/i, 'the agent is told the menu is not approved yet');
  assert.ok(!/reviewed and signed by/i.test(unsigned));

  env.DB.sqlite.prepare("UPDATE program_cycles SET dietitian_name='George Ateek', dietitian_credentials='RD, CSG, LD', dietitian_license='ND475', reviewed_at=? WHERE id='pcyc_adc4'").run(Date.now());
  const signed = await programContext(env);
  assert.match(signed, /reviewed and signed by George Ateek/);
  assert.match(signed, /ND475/);
  assert.ok(!/NOT yet signed/i.test(signed));

  const es = await programContext(env, { lang: 'es' });
  assert.match(es, /cuidado diurno de adultos/i);
});

test('program context stays silent when there is no program, so it never pollutes a prompt', async () => {
  const env = ownerEnv();
  env.DB.sqlite.prepare('DELETE FROM program_cycle_items').run();
  env.DB.sqlite.prepare('DELETE FROM program_cycles').run();
  assert.equal(await programContext(env), '');
});

test('the kitchen training module is due again, with the program update in both languages', () => {
  assert.equal(CURRENT_VERSION.kitchen, '2026-09-21-adult-day-program');
  const u = UPDATES['2026-09-21-adult-day-program'];
  assert.equal(u.module, 'kitchen');
  assert.ok(u.headline.en && u.headline.es);
  assert.ok(u.changes.length >= 3);
  for (const c of u.changes) {
    assert.ok(c.en && c.es, 'every bullet exists in both languages');
    assert.ok(!/^\s*$/.test(c.es));
  }
  // Someone trained on the photo-gate version is now out of date and gets shown THIS update.
  const due = updateFor('kitchen', '2026-09-16-photo-gate');
  assert.ok(due);
  assert.match(due.headline.en, /adult day care/i);
});
