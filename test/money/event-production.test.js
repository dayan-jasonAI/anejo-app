// 2026-09-22, with a paid 30-guest event four days out: the HUB held the money and the menu for it
// and the KITCHEN could not see the event at all. This file pins the plan that closes that gap —
// derived from the quote every time, never a stale copy — against the real 9/26 booking's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import {
  matchRecipe, qtyOf, scaleQty, shoppingList, packagingList, schedule, laborEstimate,
  designBrief, eventPlan, setEventTask, setEventDetails, setCookMinutes, briefCandidates, upcomingEvents,
  workingHour,
} from '../../functions/_lib/event.js';
import { onRequestGet as eventGet, onRequestPost as eventPost } from '../../functions/api/hub/kitchen/event.js';

const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, {
  ...init, headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE, ...(init.headers || {}) },
});

// The seven lines of the live 9/26 booking, verbatim in shape.
const LINES = [
  { name: 'Roast pork — Lechón asado', name_es: 'Lechón asado', qty: '30', cents: 9500 },
  { name: 'Congrí', name_es: 'Congrí', qty: '30', cents: 7000 },
  { name: 'Cuban tamales', name_es: 'Tamales cubanos', qty: '30', cents: 7500 },
  { name: 'Yuca with onion & chicharrones', name_es: 'Yuca con cebolla y chicharrones', qty: '30', cents: 5000 },
  { name: 'Sausage croquetas — 2 trays', name_es: 'Croquetas de salchicha — 2 bandejas', qty: '60', cents: 7000 },
  { name: 'Cold macaroni salad', name_es: 'Ensalada fría de coditos', qty: '30', cents: 6500 },
  { name: 'Skewers — grape, ham, cheese, guava & pineapple', name_es: 'Pinchos — uva, jamón, queso, guayaba y piña', qty: '30', cents: 6000 },
];

function seedQuote(env, over = {}) {
  const t = Date.now();
  const q = {
    id: 'cq_test', customer_name: 'Karina', customer_phone: '+15615417041', customer_email: 'k@example.test',
    event_date: '2026-09-26', guests: 30, total_cents: 48500, deposit_pct: 0.5, deposit_cents: 24250,
    balance_cents: 24250, deposit_status: 'paid', deposit_paid_cents: 24250, balance_status: 'due',
    balance_due_date: '2026-09-25', final_count_due: '2026-09-16', terms_version: '2026-09-v2',
    terms_json: '{}', quote_json: JSON.stringify({ lines: LINES }), ...over,
  };
  env.DB.sqlite.prepare(
    `INSERT INTO catering_quotes (id, customer_name, customer_phone, customer_email, event_date, guests,
       total_cents, deposit_pct, deposit_cents, balance_cents, deposit_status, deposit_paid_cents,
       balance_status, balance_due_date, final_count_due, terms_version, terms_json, quote_json,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(q.id, q.customer_name, q.customer_phone, q.customer_email, q.event_date, q.guests, q.total_cents,
    q.deposit_pct, q.deposit_cents, q.balance_cents, q.deposit_status, q.deposit_paid_cents, q.balance_status,
    q.balance_due_date, q.final_count_due, q.terms_version, q.terms_json, q.quote_json, t, t);
  return q.id;
}

function seedRecipe(env, { id: rid, name, name_es, ingredients, status = 'published' }) {
  const t = Date.now();
  env.DB.sqlite.prepare(
    'INSERT INTO recipes (id, name, name_es, ingredients, steps, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(rid, name, name_es || null, JSON.stringify(ingredients || []), '[]', status, t, t);
}

// ---------------------------------------------------------------- matching

test('a quote line finds its recipe by name in either language, and refuses a near-miss', () => {
  const recipes = [
    { name: 'Congrí', name_es: 'Congrí' },
    { name: 'Roast pork — Lechón asado', name_es: 'Lechón asado' },
    { name: 'Cold macaroni salad', name_es: 'Ensalada fría de coditos' },
  ];
  assert.equal(matchRecipe(LINES[1], recipes).name, 'Congrí');
  assert.equal(matchRecipe(LINES[0], recipes).name, 'Roast pork — Lechón asado');
  assert.equal(matchRecipe(LINES[5], recipes).name, 'Cold macaroni salad');
  // Nothing on file for tamales or skewers: null, not the closest thing on the shelf. A wrong
  // recipe would silently produce a wrong shopping list.
  assert.equal(matchRecipe(LINES[2], recipes), null);
  assert.equal(matchRecipe(LINES[6], recipes), null);
  // Spanish alone is enough.
  assert.equal(matchRecipe({ name: '', name_es: 'Lechón asado' }, recipes).name, 'Roast pork — Lechón asado');
});

test('a quantity a human typed becomes a number, or nothing', () => {
  assert.equal(qtyOf({ qty: '30' }), 30);
  assert.equal(qtyOf({ qty: '2 trays' }), 2);
  assert.equal(qtyOf({ qty: '' }), null);
  assert.equal(qtyOf({}), null);
});

test('ingredients scale from the 45-portion basis; a quantity with no number is left alone', () => {
  assert.equal(scaleQty('45 lb pork shoulder', 45), '45 lb pork shoulder');
  assert.equal(scaleQty('45 lb pork shoulder', 30), '30 lb pork shoulder');
  assert.equal(scaleQty('9 lb black beans', 30), '6 lb black beans');
  assert.equal(scaleQty('to taste', 30), 'to taste');
  assert.equal(scaleQty('½ cup cumin', 45), '0.5 cup cumin');
});

// ---------------------------------------------------------------- shopping and packaging

test('the purchase list aggregates ingredients across dishes and reports what inventory holds', () => {
  const production = [
    { name: 'Congrí', ingredients: [{ item: 'White rice', qty: '6 lb' }, { item: 'Garlic', qty: '4 oz' }] },
    { name: 'Lechón', ingredients: [{ item: 'Garlic', qty: '8 oz' }, { item: 'Pork shoulder', qty: '30 lb' }] },
  ];
  const list = shoppingList(production, [{ name: 'garlic', unit: 'lb', on_hand: 2 }]);
  const garlic = list.find((l) => l.item === 'Garlic');
  assert.deepEqual(garlic.quantities, ['12 oz'], 'the same unit is added up — a shopper buys it once');
  assert.deepEqual(garlic.for, ['Congrí', 'Lechón'], 'and both dishes that need it are named');
  assert.equal(garlic.on_hand.amount, 2);
  // The unit inventory counts in and the unit a recipe speaks in are not the same; the list says
  // what is on hand and leaves the subtraction to the person holding the case.
  assert.match(garlic.note, /check it before buying/);
  assert.equal(list.find((l) => l.item === 'White rice').on_hand, null);
});

test('a line with no recipe contributes nothing to the purchase list, rather than a guess', () => {
  const list = shoppingList([{ name: 'Cuban tamales', ingredients: [] }], []);
  assert.equal(list.length, 0);
});

test('packaging counts come from the order: one pan per 25 hot portions, platters for the finger food', () => {
  const production = [
    { name: 'Roast pork — Lechón asado', portions: 30 },
    { name: 'Congrí', portions: 30 },
    { name: 'Sausage croquetas — 2 trays', portions: 60 },
  ];
  const pack = packagingList(production, 30);
  assert.equal(pack.find((p) => /pans/i.test(p.item)).qty, 4, '30 portions is two pans each for pork and congrí');
  assert.equal(pack.find((p) => /platters/i.test(p.item)).qty, 2, '60 croquetas ride on two platters');
  assert.equal(pack.find((p) => /Labels/.test(p.item)).qty, 6, 'every pan and platter gets a label');
  assert.ok(pack.find((p) => /Chafing/.test(p.item)), 'hot food needs to hold at temperature through service');
});

// ---------------------------------------------------------------- the schedule

const EVENT_MS = Date.parse('2026-09-26T00:00:00');
const at = (tasks, key) => tasks.find((t) => t.key === key);

test('the schedule runs backwards from serving time, and holds its order', () => {
  const tasks = schedule({
    eventDateMs: EVENT_MS, servingTime: '19:00', guests: 30,
    production: [{ key: 'l0', name: 'Congrí', portions: 30, minutes: 90, recipe: {} }],
  });
  const serve = new Date(at(tasks, 'serve').at);
  assert.equal(serve.getHours(), 19, 'service starts at the hour the customer was promised');
  assert.equal(at(tasks, 'arrive').at, at(tasks, 'serve').at - 30 * 60000, 'half an hour to set up');
  assert.equal(at(tasks, 'depart').at, at(tasks, 'arrive').at - 30 * 60000, 'half an hour to drive');
  assert.equal(at(tasks, 'pack').at, at(tasks, 'depart').at - 45 * 60000, 'three quarters of an hour to pack');
  assert.ok(at(tasks, 'cook:l0').at < at(tasks, 'pack').at, 'the cooking finishes before the packing starts');
  // Sorted, so the cook reads the list top to bottom and it is already in order.
  for (let i = 1; i < tasks.length; i++) assert.ok(tasks[i].at >= tasks[i - 1].at);
});

test('a cook longer than two hours lands the day before — a nine-hour pork does not start on Saturday', () => {
  const tasks = schedule({
    eventDateMs: EVENT_MS, servingTime: '19:00', guests: 30,
    production: [
      { key: 'l0', name: 'Roast pork', portions: 30, minutes: 540 },
      { key: 'l1', name: 'Congrí', portions: 30, minutes: 90 },
    ],
  });
  const pork = new Date(at(tasks, 'cook:l0').at);
  const congri = new Date(at(tasks, 'cook:l1').at);
  assert.equal(pork.getDate(), 25, 'the pork goes in on Friday');
  assert.equal(congri.getDate(), 26, 'the rice is cooked the day of');
});

test('without a serving time the schedule still runs, from a stated 7 p.m. assumption', () => {
  const tasks = schedule({ eventDateMs: EVENT_MS, servingTime: null, guests: 30, production: [] });
  assert.equal(new Date(at(tasks, 'serve').at).getHours(), 19);
});

test('the hours are totalled per day, so a shift can be planned against them', () => {
  const tasks = schedule({
    eventDateMs: EVENT_MS, servingTime: '19:00', guests: 30,
    production: [{ key: 'l0', name: 'Roast pork', portions: 30, minutes: 540 }, { key: 'l1', name: 'Congrí', portions: 30, minutes: 90 }],
  });
  const labor = laborEstimate(tasks);
  assert.equal(labor.days.length, 3, 'shopping Thursday, the long cook Friday, service Saturday');
  const sat = labor.days.find((d) => d.day === '2026-09-26');
  assert.ok(sat.hours > 0 && sat.to > sat.from, 'Saturday has a window with a start and an end');
  // The money and the phone call are real tasks but they are not kitchen labour.
  assert.equal(labor.total_minutes, tasks.filter((t) => t.minutes && t.kind !== 'money' && t.kind !== 'customer')
    .reduce((n, t) => n + t.minutes, 0));
});

test('the theme becomes a brief, and no theme becomes no brief rather than an empty one', () => {
  const brief = designBrief({ theme: '42nd birthday — white theme', colors: 'white and beige' },
    [{ name: 'Congrí', name_es: 'Congrí' }]);
  assert.match(brief.needs.join(' '), /label for every pan/i);
  assert.match(brief.needs.join(' '), /white and beige/);
  assert.deepEqual(brief.dishes, [{ en: 'Congrí', es: 'Congrí' }]);
  assert.equal(designBrief({ theme: null, colors: null }, []), null);
});

// ---------------------------------------------------------------- the whole plan

test('the plan is built from the quote, and says plainly what it does not know', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedRecipe(env, { id: 'rcp_congri', name: 'Congrí', name_es: 'Congrí', ingredients: [{ item: 'White rice', qty: '9 lb' }] });
  // A dish this kitchen has never written down. Every order will have one sooner or later, and
  // what the plan does about it is the property under test.
  env.DB.sqlite.prepare("UPDATE catering_quotes SET quote_json = ? WHERE id = 'cq_test'")
    .run(JSON.stringify({ lines: [...LINES, { name: 'Flan de coco', name_es: 'Flan de coco', qty: '30', cents: 4000 }] }));

  const plan = await eventPlan(env, 'cq_test', { atMs: Date.parse('2026-09-22T12:00:00') });
  assert.equal(plan.ok, true);
  assert.equal(plan.event.guests, 30);
  assert.equal(plan.event.days_out, 4);
  assert.equal(plan.production.length, 8, 'every line of the quote is a thing to make');

  // Scaled to this event, not to the recipe's own basis.
  const congri = plan.production.find((p) => p.name === 'Congrí');
  assert.deepEqual(congri.ingredients, [{ item: 'White rice', qty: '6 lb', basis: '9 lb' }]);
  assert.equal(congri.recipe.id, 'rcp_congri', 'a published recipe beats the program copy at the same score');

  // A dish with no recipe is NAMED, not silently skipped, and it contributes nothing to the
  // purchase list rather than a guess.
  const noRecipe = plan.production.filter((p) => p.needs_recipe).map((p) => p.name);
  assert.deepEqual(noRecipe, ['Flan de coco']);
  assert.ok(plan.gaps.some((g) => g.includes('Flan de coco') && /No recipe on file/.test(g)));
  // A draft recipe is called a draft wherever it appears — the cook is the authority, not the HUB.
  assert.ok(plan.gaps.some((g) => /still a draft/.test(g) && g.includes('Cuban tamales')));
  // The catering lechón is the one that gets used, not the contract copy. See the dedicated test
  // below for what happens when only a program recipe exists.
  const lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.equal(lechon.recipe.program, false);
  // The facts the quote never captured.
  assert.ok(plan.gaps.some((g) => /No serving time/.test(g)));
  assert.ok(plan.gaps.some((g) => /No delivery address/.test(g)));
  // The money the kitchen has to collect on the day.
  assert.ok(plan.gaps.some((g) => /balance of \$242\.50/.test(g)));

  assert.ok(plan.shopping.length >= 2);
  assert.ok(plan.packaging.length > 0);
  assert.ok(plan.tasks.length >= 10);
  assert.ok(plan.labor.total_hours > 0);
  assert.equal(plan.design, null, 'no theme on file yet, so no brief is invented');
  assert.equal(plan.logistics.load.length, plan.production.length + 1);
});

test('an unpaid deposit is stated as an unconfirmed event, not left to be assumed', async () => {
  const env = ownerEnv();
  seedQuote(env, { deposit_status: 'unpaid', deposit_paid_cents: null });
  const plan = await eventPlan(env, 'cq_test');
  assert.ok(plan.gaps.some((g) => /deposit has not been paid/.test(g)));
});

test('an id that is not an event is a clear answer, not a crash', async () => {
  const env = ownerEnv();
  const plan = await eventPlan(env, 'cq_nope');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /No event/);
});

// ---------------------------------------------------------------- what a person did

test('a task is ticked, re-ticked and unticked without piling up rows', async () => {
  const env = ownerEnv();
  seedQuote(env);
  assert.equal((await setEventTask(env, { quote_id: 'cq_test', task_key: 'shop', done: true }, { email: 'k@test.example' })).done, true);
  await setEventTask(env, { quote_id: 'cq_test', task_key: 'shop', done: true, note: 'Restaurant Depot' }, { email: 'k@test.example' });
  assert.equal(env.DB.rows('SELECT * FROM event_tasks WHERE quote_id = ?', 'cq_test').length, 1, 'one row per task, updated in place');

  let plan = await eventPlan(env, 'cq_test');
  const shop = plan.tasks.find((t) => t.key === 'shop');
  assert.equal(shop.done, true);
  assert.equal(shop.done_by, 'k@test.example');
  assert.equal(shop.note, 'Restaurant Depot');

  await setEventTask(env, { quote_id: 'cq_test', task_key: 'shop', done: false }, {});
  plan = await eventPlan(env, 'cq_test');
  assert.equal(plan.tasks.find((t) => t.key === 'shop').done, false);
  assert.equal(env.DB.rows('SELECT * FROM event_tasks', ).length, 0);
});

test('changing the guest count changes the plan — nothing stale is left behind', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedRecipe(env, { id: 'rcp_congri', name: 'Congrí', ingredients: [{ item: 'White rice', qty: '9 lb' }] });
  const before = await eventPlan(env, 'cq_test');
  assert.equal(before.production.find((p) => p.name === 'Congrí').ingredients[0].qty, '6 lb');

  env.DB.sqlite.prepare("UPDATE catering_quotes SET guests = 45, quote_json = ? WHERE id = 'cq_test'")
    .run(JSON.stringify({ lines: LINES.map((l) => ({ ...l, qty: '45' })) }));
  const after = await eventPlan(env, 'cq_test');
  assert.equal(after.event.guests, 45);
  assert.equal(after.production.find((p) => p.name === 'Congrí').ingredients[0].qty, '9 lb');
});

// ---------------------------------------------------------------- when, where and what it looks like

test('the serving time is validated, and setting it moves the whole schedule', async () => {
  const env = ownerEnv();
  seedQuote(env);
  assert.match((await setEventDetails(env, { quote_id: 'cq_test', serving_time: '7pm' })).error, /24-hour time/);
  assert.match((await setEventDetails(env, { quote_id: 'cq_test', serving_time: '25:00' })).error, /24-hour time/);
  assert.equal((await setEventDetails(env, { quote_id: 'cq_test', serving_time: '13:30', address: '1 Main St' })).ok, true);

  const plan = await eventPlan(env, 'cq_test');
  const serve = new Date(plan.tasks.find((t) => t.key === 'serve').at);
  assert.equal(serve.getHours(), 13);
  assert.equal(serve.getMinutes(), 30);
  assert.equal(plan.event.address, '1 Main St');
  assert.ok(!plan.gaps.some((g) => /No serving time|No delivery address/.test(g)));
});

function seedBrief(env, { leadId = 'ld_brief', guests = 30, msg } = {}) {
  const t = Date.now();
  env.DB.sqlite.prepare(
    "INSERT INTO leads (id, name, email, kind, message, created_at) VALUES (?,?,?,'catering',?,?)"
  ).run(leadId, 'Dayan', 'd@example.test', msg || [
    'Event type: Birthday party',
    'Serving time: 19:00',
    `Guest count: ${guests}`,
    'Location: 33461',
    'Event theme / occasion: 42 Birthday - White Theme - White Flowers',
    'Colors / special touches: White and Beich',
    'Dietary needs / allergies: None provided',
  ].join('\n'), t);
  return leadId;
}

test('the design request that carries the time, the address and the theme is offered, not retyped', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedBrief(env);
  seedBrief(env, { leadId: 'ld_other', guests: 12 });
  const found = await briefCandidates(env, { guests: 30 });
  assert.equal(found.length, 1, 'only the request with this event’s headcount');
  assert.equal(found[0].lead_id, 'ld_brief');
  assert.equal(found[0].serving_time, '19:00');
  assert.equal(found[0].theme, '42 Birthday - White Theme - White Flowers');
  assert.equal(found[0].dietary_notes, null, '"None provided" is not a dietary note');
});

test('linking a brief fills only the blanks — a fact the kitchen already corrected stands', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedBrief(env);
  await setEventDetails(env, { quote_id: 'cq_test', serving_time: '17:00' });
  const res = await eventPost({ request: req('/api/hub/kitchen/event', { method: 'POST', body: JSON.stringify({ op: 'link_brief', quote_id: 'cq_test', lead_id: 'ld_brief' }) }), env });
  const body = await res.json();
  assert.equal(body.ok, true);
  const plan = await eventPlan(env, 'cq_test');
  assert.equal(plan.event.serving_time, '17:00', 'the kitchen’s own correction is not overwritten');
  assert.equal(plan.event.address, '33461', 'the blank one is filled');
  assert.equal(plan.event.theme, '42 Birthday - White Theme - White Flowers');
  assert.equal(plan.event.source_lead_id, 'ld_brief', 'where the facts came from is recorded');
  assert.ok(plan.design, 'and the theme is now a brief the studio can work from');
});

test('a design request that does not match this event is refused', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedBrief(env, { leadId: 'ld_other', guests: 12 });
  const res = await eventPost({ request: req('/api/hub/kitchen/event', { method: 'POST', body: JSON.stringify({ op: 'link_brief', quote_id: 'cq_test', lead_id: 'ld_other' }) }), env });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------- the list, and the door

test('the upcoming list shows booked events and leaves voided quotes out', async () => {
  const env = ownerEnv();
  seedQuote(env);
  seedQuote(env, { id: 'cq_void', customer_name: 'Duplicate', deposit_status: 'void' });
  seedQuote(env, { id: 'cq_far', customer_name: 'Later', event_date: '2027-01-01' });
  const list = await upcomingEvents(env, { atMs: Date.parse('2026-09-22T12:00:00') });
  assert.deepEqual(list.map((e) => e.id), ['cq_test'], 'a voided duplicate is not work, and January is not this week');
  assert.equal(list[0].days_out, 4);
});

test('the event screen is kitchen and owner only', async () => {
  const env = ownerEnv();
  seedQuote(env);
  const anon = await eventGet({ request: new Request('https://anejocateringco.com/api/hub/kitchen/event'), env });
  assert.ok(anon.status === 401 || anon.status === 403);
  const mkt = await eventGet({ request: req('/api/hub/kitchen/event', { headers: { Cookie: 'anejo_sess=tok-marketing' } }), env });
  assert.ok(mkt.status === 401 || mkt.status === 403);
  const cook = await eventGet({ request: req('/api/hub/kitchen/event', { headers: { Cookie: 'anejo_sess=tok-kitchen' } }), env });
  assert.equal(cook.status, 200);
});

test('the endpoint lists events, serves one plan, and records a tick', async () => {
  const env = ownerEnv();
  seedQuote(env);
  const list = await (await eventGet({ request: req('/api/hub/kitchen/event'), env })).json();
  assert.equal(list.ok, true);
  assert.equal(list.events.length, 1);

  const plan = await (await eventGet({ request: req('/api/hub/kitchen/event?id=cq_test'), env })).json();
  assert.equal(plan.ok, true);
  assert.equal(plan.event.customer, 'Karina');
  assert.ok(Array.isArray(plan.brief_candidates), 'a plan missing its time offers somewhere to get it');

  const tick = await (await eventPost({ request: req('/api/hub/kitchen/event', { method: 'POST', body: JSON.stringify({ op: 'task', quote_id: 'cq_test', task_key: 'pack', done: true }) }), env })).json();
  assert.equal(tick.ok, true);
  const after = await (await eventGet({ request: req('/api/hub/kitchen/event?id=cq_test'), env })).json();
  assert.equal(after.tasks.find((t) => t.key === 'pack').done, true);

  const junk = await eventPost({ request: req('/api/hub/kitchen/event', { method: 'POST', body: JSON.stringify({ op: 'nonsense' }) }), env });
  assert.equal(junk.status, 400);
});

test('the kitchen can reach the event screen from its own navigation', async () => {
  const { readFileSync } = await import('node:fs');
  const kitchenJs = readFileSync(new URL('../../public/hub/kitchen/kitchen.js', import.meta.url), 'utf8');
  const hubJs = readFileSync(new URL('../../public/hub/assets/hub.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../../public/hub/kitchen/index.html', import.meta.url), 'utf8');
  assert.match(kitchenJs, /key: 'events'[\s\S]*?\/hub\/kitchen\/event\.html/);
  assert.match(hubJs, /key: 'events'[\s\S]*?\/hub\/kitchen\/event\.html/, 'hub.js NAVS.kitchen must mirror kitchen.js');
  // An event inside a week also leads the service board, so nobody has to remember to go looking.
  assert.match(index, /loadEvents\(\)/);
  assert.match(index, /event\.html\?id=/);
  // And the one control through which the kitchen teaches the HUB how long a dish takes.
  const screen = readFileSync(new URL('../../public/hub/kitchen/event.html', import.meta.url), 'utf8');
  assert.match(screen, /op: 'minutes'/);
  assert.match(screen, /class="mins"/);
});

// ---------------------------------------------------------------- how long it takes to cook it

test('a dish nobody has timed says so, instead of borrowing the time it takes to plate one bowl', async () => {
  const env = ownerEnv();
  seedQuote(env);
  const t = Date.now();
  // This is the real shape of the data that caused the bug: prep_minutes is a PLATING time — three
  // minutes to assemble one bowl of congrí on the line — and reading it as a batch cook time put
  // congrí for thirty people at fifteen minutes.
  env.DB.sqlite.prepare("INSERT INTO menu_items (id, kind, name, price_cents, active, prep_minutes, created_at, updated_at) VALUES ('mi_flan','addon','Flan de coco',700,1,3,?,?)").run(t, t);
  env.DB.sqlite.prepare("UPDATE catering_quotes SET quote_json = ? WHERE id = 'cq_test'")
    .run(JSON.stringify({ lines: [{ name: 'Flan de coco', name_es: 'Flan de coco', qty: '30', cents: 4000 }] }));
  const plan = await eventPlan(env, 'cq_test');
  const flan = plan.production[0];
  assert.equal(flan.minutes_is_guess, true);
  assert.match(flan.minutes_source, /nobody has timed this dish/);
  assert.ok(flan.minutes >= 30, 'a guess errs long, not at three minutes a plate');
});

test('the cook sets the real time, it drives this event, and the kitchen keeps it for the next one', async () => {
  const env = ownerEnv();
  seedQuote(env);
  const t = Date.now();
  env.DB.sqlite.prepare("INSERT INTO menu_items (id, kind, name, price_cents, active, prep_minutes, created_at, updated_at) VALUES ('mi_congri','addon','Congrí',700,1,3,?,?)").run(t, t);

  const r = await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'cook:l1', minutes: 120 }, { email: 'k@test.example' });
  assert.equal(r.ok, true);
  assert.equal(r.remembered, true);
  assert.equal(r.per_batch, 100, '120 minutes for 30 portions is 100 minutes per 25-portion batch');
  // Remembered against the menu item that carries the dish's name, whichever row that is.
  const remembered = env.DB.rows('SELECT name, cook_minutes FROM menu_items WHERE cook_minutes IS NOT NULL');
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].name, 'Congrí');
  assert.equal(remembered[0].cook_minutes, 100);

  const plan = await eventPlan(env, 'cq_test');
  const congri = plan.production.find((p) => p.name === 'Congrí');
  assert.equal(congri.minutes, 120);
  assert.equal(congri.minutes_is_guess, false);
  assert.match(congri.minutes_source, /set by the kitchen for this event/);
  // And the schedule moved with it: two hours of congrí cannot start where fifteen minutes did.
  assert.equal(plan.tasks.find((x) => x.key === 'cook:l1').minutes, 120);
});

test('the remembered time becomes the starting point for the next event, scaled to its size', async () => {
  const env = ownerEnv();
  const t = Date.now();
  env.DB.sqlite.prepare("INSERT INTO menu_items (id, kind, name, price_cents, active, prep_minutes, cook_minutes, created_at, updated_at) VALUES ('mi_congri','addon','Congrí',700,1,3,100,?,?)").run(t, t);
  seedQuote(env, { id: 'cq_next', guests: 50, quote_json: JSON.stringify({ lines: [{ name: 'Congrí', name_es: 'Congrí', qty: '50', cents: 7000 }] }) });
  const plan = await eventPlan(env, 'cq_next');
  const congri = plan.production[0];
  assert.equal(congri.minutes, 200, 'twice the batch, twice the time');
  assert.match(congri.minutes_source, /the kitchen's own time/);
  assert.equal(congri.minutes_is_guess, false);
});

test('a nonsense time is refused rather than written into the schedule', async () => {
  const env = ownerEnv();
  seedQuote(env);
  assert.match((await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'cook:l1', minutes: 0 }, {})).error, /between 1 and 1440/);
  assert.match((await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'cook:l1', minutes: 'soon' }, {})).error, /between 1 and 1440/);
  assert.match((await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'pack', minutes: 30 }, {})).error, /not a dish on this plan/);
  assert.equal(env.DB.rows('SELECT * FROM event_tasks').length, 0);
});

test('a time set on a dish does not tick it done — those are different facts', async () => {
  const env = ownerEnv();
  seedQuote(env);
  await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'cook:l1', minutes: 90 }, {});
  const plan = await eventPlan(env, 'cq_test');
  assert.equal(plan.tasks.find((x) => x.key === 'cook:l1').done, false, 'knowing how long it takes is not having done it');
});

// ---------------------------------------------------------------- the purchase list as a shopper reads it

test('the same ingredient in the same unit is added up, and units that differ are left side by side', () => {
  const list = shoppingList([
    { name: 'Congrí', ingredients: [{ item: 'Yellow onion', qty: '1.25 lb' }, { item: 'Garlic', qty: '0.5 cup' }] },
    { name: 'Tamales', ingredients: [{ item: 'Yellow onion', qty: '1.25 lb' }, { item: 'Garlic', qty: '2 tbsp' }] },
  ], []);
  // A shopper buys two and a half pounds of onion once.
  assert.deepEqual(list.find((l) => l.item === 'Yellow onion').quantities, ['2.5 lb']);
  // Half a cup and two tablespoons are not the same measurement. Guessing the conversion is how a
  // list becomes wrong, so both stay, with the dishes that need them.
  assert.deepEqual(list.find((l) => l.item === 'Garlic').quantities, ['0.5 cup', '2 tbsp']);
});

test('things you buy whole are rounded up — 0.625 of a roll of twine is not a shopping instruction', () => {
  assert.equal(scaleQty('1 roll', 30), '1 roll');
  assert.equal(scaleQty('100 (allow for breakage)', 30), '67 (allow for breakage)');
  assert.equal(scaleQty('6', 30), '4', 'bay leaves come whole');
  assert.equal(scaleQty('12', 30), '8');
  // Measured units keep their fractions, because you really can weigh 2.75 lb.
  assert.equal(scaleQty('4 lb', 30), '2.75 lb');
  assert.equal(scaleQty('¾ cup', 30), '0.5 cup');
  assert.equal(scaleQty('to cover', 30), 'to cover');
});

test('every dish on the live 9/26 order now has a recipe, so the purchase list is complete', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  const plan = await eventPlan(env, 'cq_test');

  const missing = plan.production.filter((p) => p.needs_recipe).map((p) => p.name);
  assert.deepEqual(missing, [], 'the six dishes 0127 added close the gap the first plan found');
  assert.ok(plan.shopping.length > 50, 'and the purchase list is the whole order, not one dish');
  assert.ok(plan.shopping.some((l) => /Masa harina/.test(l.item)), 'tamales reached the list');
  assert.ok(plan.shopping.some((l) => /Guava paste/.test(l.item)), 'so did the skewers');
  assert.ok(plan.shopping.some((l) => /Elbow macaroni/.test(l.item)));

  // Still honest: seeded as drafts, so the cook is asked to confirm them before they are trusted.
  const drafts = plan.production.filter((p) => p.recipe && p.recipe.draft).map((p) => p.name);
  assert.equal(drafts.length, 7);
  assert.equal(plan.gaps.filter((g) => /still a draft/.test(g)).length, 7);
});

test('the catering recipes are catering recipes — the adult day care cycle does not point at them', () => {
  const env = ownerEnv();
  const rows = env.DB.rows("SELECT id, status, program_key, portion FROM recipes WHERE id LIKE 'rcp_cat_%'");
  assert.equal(rows.length, 7);
  for (const r of rows) {
    assert.equal(r.status, 'draft', `${r.id} must be a draft until the kitchen confirms it`);
    assert.equal(r.program_key, null, `${r.id} must not be reachable from the signed program cycle`);
    assert.match(r.portion, /^45 /, 'written to the same 45-unit basis scaleQty scales from');
  }
  // And the dietitian-signed cycle still points only at its own recipes.
  const cycle = env.DB.rows("SELECT recipe_id FROM program_cycle_items WHERE recipe_id LIKE 'rcp_cat_%'");
  assert.equal(cycle.length, 0);
});

test('both languages are filled in, because the cook reads Spanish', () => {
  const env = ownerEnv();
  for (const r of env.DB.rows("SELECT * FROM recipes WHERE id LIKE 'rcp_cat_%'")) {
    for (const col of ['name_es', 'summary_es', 'ingredients_es', 'steps_es', 'portion_es']) {
      assert.ok(r[col] && String(r[col]).length > 2, `${r.id}.${col} is empty`);
    }
    const en = JSON.parse(r.ingredients); const es = JSON.parse(r.ingredients_es);
    assert.equal(en.length, es.length, `${r.id}: an ingredient is missing from one language`);
    assert.equal(JSON.parse(r.steps).length, JSON.parse(r.steps_es).length, `${r.id}: a step is missing from one language`);
  }
});

// ---------------------------------------------------------------- the catering lechón

test('a catering recipe beats the contract one, because a signed portion is not a catering portion', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  const plan = await eventPlan(env, 'cq_test');
  const lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.equal(lechon.recipe.id, 'rcp_cat_lechon');
  assert.equal(lechon.recipe.program, false);
  // And the flag that used to fire on this line is gone, because there is nothing left to warn about.
  assert.equal(plan.gaps.filter((g) => /adult day care program recipe/.test(g)).length, 0);
  // The adult day care recipe is untouched and still the 3 oz portion its contract is signed for.
  const adc = env.DB.one("SELECT portion FROM recipes WHERE id = 'rcp_adc_lech_n_asado'");
  assert.match(adc.portion, /3 oz/);
});

test('when the ONLY recipe for a dish is a contract one, it is used but the portion is flagged', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  // Take the catering lechón away and the adult day care copy is all that is left. The plan still
  // cooks from it rather than refusing — but it says whose portion that is.
  env.DB.sqlite.prepare("DELETE FROM recipes WHERE id = 'rcp_cat_lechon'").run();
  const plan = await eventPlan(env, 'cq_test');
  const lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.equal(lechon.recipe.id, 'rcp_adc_lech_n_asado');
  assert.equal(lechon.recipe.program, true);
  assert.ok(plan.gaps.some((g) => /adult day care program recipe/.test(g) && g.includes('Roast pork')));
  assert.match(plan.gaps.find((g) => /adult day care/.test(g)), /3 oz/, 'and names the portion it is signed for');
});

test('the recipe supplies its own cook time, so an eight-hour roast is not scheduled for 45 minutes', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  const plan = await eventPlan(env, 'cq_test');
  const lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.equal(lechon.minutes, 320, '480 minutes for 45 portions, scaled to 30');
  assert.match(lechon.minutes_source, /from the recipe/);
  assert.equal(lechon.minutes_is_guess, false);
  // Over two hours, so it lands the day before rather than on Saturday afternoon.
  assert.equal(new Date(plan.tasks.find((t) => t.key === 'cook:l0').at).getDate(), 25);
});

test('the kitchen measurement still beats what the recipe says', async () => {
  const env = ownerEnv();
  const t = Date.now();
  seedQuote(env, { serving_time: '19:00' });
  env.DB.sqlite.prepare("INSERT INTO menu_items (id, kind, name, price_cents, active, cook_minutes, created_at, updated_at) VALUES ('mi_lechon','addon','Roast pork — Lechón asado',1200,1,200,?,?)").run(t, t);
  let plan = await eventPlan(env, 'cq_test');
  let lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.match(lechon.minutes_source, /the kitchen's own time/);
  assert.equal(lechon.minutes, 240, '200 min per 25 portions, scaled to 30');

  // And this event's own override beats both.
  await setCookMinutes(env, { quote_id: 'cq_test', task_key: 'cook:l0', minutes: 400, remember: false });
  plan = await eventPlan(env, 'cq_test');
  lechon = plan.production.find((p) => /Roast pork/.test(p.name));
  assert.equal(lechon.minutes, 400);
  assert.match(lechon.minutes_source, /set by the kitchen for this event/);
});

// ---------------------------------------------------------------- the make-ahead steps

test('a step that must start before cooking gets its own task, at the hour it has to begin', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  const plan = await eventPlan(env, 'cq_test');
  const prep = plan.tasks.filter((t) => t.kind === 'make-ahead');
  assert.equal(prep.length, 5, 'the marinade, the beans, the husks, the croqueta mix and the macaroni');
  const marinade = plan.tasks.find((t) => t.key === 'prep:l0');
  const roast = plan.tasks.find((t) => t.key === 'cook:l0');
  assert.match(marinade.label, /marinate the pork in mojo/);
  assert.equal(roast.at - marinade.at, 1440 * 60000, 'a full day ahead of the oven, as the recipe says');
  // A dish with no make-ahead step does not get an empty task invented for it.
  assert.equal(plan.tasks.some((t) => t.key === 'prep:l3'), false, 'the yuca needs nothing made ahead');
});

test('a make-ahead step is never scheduled in the middle of the night', () => {
  const night = Date.parse('2026-09-26T04:45:00');
  const moved = new Date(workingHour(night));
  assert.equal(moved.getDate(), 25, 'it rolls back to the evening before');
  assert.equal(moved.getHours(), 18);
  // Late at night rolls back to the same evening.
  const late = new Date(workingHour(Date.parse('2026-09-25T23:30:00')));
  assert.equal(late.getDate(), 25);
  assert.equal(late.getHours(), 18);
  // Anything inside the working day is left exactly where the arithmetic put it.
  const fine = Date.parse('2026-09-25T19:45:00');
  assert.equal(workingHour(fine), fine);
  assert.equal(workingHour(Date.parse('2026-09-25T06:00:00')), Date.parse('2026-09-25T06:00:00'));
});

test('the long cooks start earliest and the fresh work finishes nearest the van', async () => {
  const env = ownerEnv();
  seedQuote(env, { serving_time: '19:00' });
  const plan = await eventPlan(env, 'cq_test');
  const byKey = (k) => plan.tasks.find((t) => t.key === k).at;
  const skewers = plan.production.findIndex((p) => /Skewers/.test(p.name));
  const tamales = plan.production.findIndex((p) => /tamales/.test(p.name));
  // Both are cooked on the day; the longer one starts first.
  assert.ok(byKey(`cook:l${tamales}`) < byKey(`cook:l${skewers}`),
    'a three-hour tamal does not wait behind fifty minutes of skewers');
  // And nothing is still cooking once packing starts.
  const pack = byKey('pack');
  for (const t of plan.tasks.filter((x) => x.kind === 'kitchen' && x.key.startsWith('cook:'))) {
    assert.ok(t.at + t.minutes * 60000 <= pack, `${t.label} runs into the packing`);
  }
});
