// EVENT PRODUCTION — turning a paid catering quote into the work that has to happen.
// Files under functions/_lib are NOT routed.
//
// WHAT WAS MISSING. On 2026-09-22, with a paid 30-guest event four days out, the HUB held the money
// and the menu for it — quote, deposit paid, balance due, seven lines, terms — and the kitchen could
// not see the event at all. The kitchen's catering screen lists Cajita DESIGN REQUESTS from the
// website; a booked, paid event appeared on no kitchen surface. Recipes, inventory, prep times and
// clock-ins all existed separately, and the plan connecting them lived in the owner's head.
//
// So this derives, from the quote itself:
//   · production — each line, the recipe behind it, and the amounts for THIS guest count
//   · shopping   — those ingredients aggregated, with what inventory says is already on hand
//   · packaging  — the pans, platters, labels and utensils the order actually needs
//   · schedule   — tasks placed backwards from serving time, using measured prep minutes
//   · hours      — what that schedule costs in labour, so a shift can be planned
//   · logistics  — the load, the temperatures, the drive, and who signs
//   · design     — the theme the customer asked for, as a brief the studio can work from
//
// DERIVED, NOT STORED. The plan is recomputed every time it is opened, so changing the guest count
// changes the plan instead of leaving a stale copy behind. The only thing stored is what a human
// DID — a task ticked — which is what event_tasks holds.
//
// HONEST ABOUT WHAT IT DOES NOT KNOW. A line with no recipe on file says so and asks for one
// instead of inventing quantities; a draft recipe is labelled draft everywhere it appears. The cook
// is the authority on these dishes, and the HUB is not.
import { id, now, parseJson } from './hub.js';

const DAY = 86400000;
const MIN = 60000;

// ---------------------------------------------------------------- matching a quote line to a recipe

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The words in a line that name the dish, ignoring counts and packaging talk. */
export const dishWords = (s) => norm(s)
  .replace(/\b(for|guests|tray|trays|pieces|piece|each|at|and|with|the|of|de|con|para|por|servings|porciones|oz|serving)\b/g, ' ')
  .split(' ').filter((w) => w.length > 2);

const overlap = (a, b) => {
  const A = new Set(a); const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let hits = 0; for (const w of B) if (A.has(w)) hits++;
  return hits / Math.max(A.size, B.size);
};

/**
 * The best recipe for a quote line, matched by name in either language. Returns null rather than a
 * near-miss: a wrong recipe produces a wrong shopping list, which is worse than an empty one.
 */
export function matchRecipe(line, recipes) {
  // Each language is scored against each language separately and the best pairing wins. Pooling
  // both names into one bag of words punishes a bilingual recipe for being bilingual: a
  // Spanish-only line would have to match "Roast pork — Lechón asado" AND "Lechón asado" at once.
  const lineSides = [dishWords(line.name), dishWords(line.name_es)].filter((w) => w.length);
  if (!lineSides.length) return null;
  let best = null;
  for (const r of recipes) {
    const recipeSides = [dishWords(r.name), dishWords(r.name_es)].filter((w) => w.length);
    let score = 0;
    for (const a of lineSides) for (const b of recipeSides) score = Math.max(score, overlap(a, b));
    // A tie goes to the published recipe: a draft is someone's work in progress.
    const better = !best || score > best.score
      || (score === best.score && r.status === 'published' && best.recipe.status !== 'published');
    if (score >= 0.6 && better) best = { recipe: r, score };
  }
  return best ? best.recipe : null;
}

/** "30" → 30. A quote's qty is a string a human typed. */
export function qtyOf(line) {
  const m = String(line && line.qty != null ? line.qty : '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

// ---------------------------------------------------------------- ingredients and shopping

const FRACTION = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// Units you can hold a fraction of. Everything else — eggs, bay leaves, corn husks, a roll of
// twine — you buy whole, so scaling them rounds UP. "0.625 roll" of butcher twine is not a
// shopping instruction.
const MEASURES = new Set(['cup', 'cups', 'tbsp', 'tbsps', 'tsp', 'tsps', 'lb', 'lbs', 'pound', 'pounds',
  'oz', 'ounce', 'ounces', 'qt', 'qts', 'quart', 'quarts', 'gal', 'gallon', 'gallons', 'pt', 'pint', 'pints',
  'g', 'kg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres', 'portion', 'portions', 'cucharada', 'cucharadas',
  'taza', 'tazas', 'cda', 'cdas', 'cdta', 'cdtas', 'galon', 'galones', 'libra', 'libras']);

const unitWord = (rest) => ((String(rest || '').match(/^[a-zá-ÿ]+/i) || [''])[0]).toLowerCase();

/** Split "12 lb raw" into its number and the rest, or null when it carries no number at all. */
function splitQty(qty) {
  const s = String(qty == null ? '' : qty).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔])?\s*(.*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  return { value: (m[1] ? Number(m[1]) : 0) + (m[2] ? FRACTION[m[2]] : 0), rest: m[3] };
}

function formatQty(value, rest) {
  const whole = !MEASURES.has(unitWord(rest));
  const v = whole ? Math.ceil(value) : value;
  const pretty = whole || v >= 10 ? String(Math.round(v))
    : v >= 1 ? String(Math.round(v * 4) / 4) : String(Math.round(v * 8) / 8);
  return `${pretty} ${rest}`.trim();
}

/** Scale "12 lb raw" from a recipe's basis to the portions this event needs. */
export function scaleQty(qty, portions, basis = 45) {
  const f = portions / (basis || 45);
  const parts = splitQty(qty);
  if (!parts || !Number.isFinite(f) || f <= 0) return String(qty == null ? '' : qty);
  return formatQty(parts.value * f, parts.rest);
}

/**
 * One line per ingredient. Quantities in the SAME unit are added up — a shopper buys 2.5 lb of
 * onion once, not "1.25 lb + 1.25 lb". Quantities in units that do not match are left side by
 * side rather than force-converted, because 4 oz and 1 cup of garlic are not the same measurement
 * and guessing the conversion is how a list becomes wrong.
 */
function combineQuantities(quantities) {
  const parts = quantities.map(splitQty);
  if (parts.some((p) => !p)) return quantities;
  const rest = parts[0].rest.trim().toLowerCase();
  if (!parts.every((p) => p.rest.trim().toLowerCase() === rest)) return quantities;
  return [formatQty(parts.reduce((n, p) => n + p.value, 0), parts[0].rest)];
}

/** What to buy: every recipe's ingredients at this event's scale, against what inventory holds. */
export function shoppingList(production, inventory = []) {
  const onHand = new Map(inventory.map((i) => [norm(i.name), i]));
  const lines = new Map();
  for (const p of production) {
    for (const ing of p.ingredients) {
      const key = norm(ing.item);
      const cur = lines.get(key) || { item: ing.item, quantities: [], for: [] };
      cur.quantities.push(ing.qty);
      if (!cur.for.includes(p.name)) cur.for.push(p.name);
      lines.set(key, cur);
    }
  }
  return [...lines.values()].map((l) => {
    const inv = onHand.get(norm(l.item));
    return {
      ...l,
      quantities: combineQuantities(l.quantities),
      // Inventory counts in its own units ("case", "lb") while a recipe speaks in cups and pounds.
      // Saying what is on hand beats subtracting units that do not match.
      on_hand: inv ? { amount: inv.on_hand, unit: inv.unit || null } : null,
      note: inv ? `Inventory shows ${inv.on_hand} ${inv.unit || ''}`.trim() + ' on hand — check it before buying.' : null,
    };
  });
}

// ---------------------------------------------------------------- packaging

const isPlatter = (name) => /croqueta|skewer|pincho|tray|bandeja|empanada/i.test(String(name || ''));

/**
 * What the food travels and serves in. A half pan holds about 25 portions of a hot item, so the
 * count comes from the order rather than from a guess.
 */
export function packagingList(production, guests) {
  const out = [];
  let pans = 0; let platters = 0;
  for (const p of production) {
    const n = p.portions || guests || 0;
    if (isPlatter(p.name)) platters += Math.max(1, Math.ceil(n / 30));
    else pans += Math.max(1, Math.ceil(n / 25));
  }
  if (pans) {
    out.push({ item: 'Half-size aluminium pans with lids', qty: pans, why: 'One pan per 25 portions of each hot dish' });
    out.push({ item: 'Chafing racks with fuel', qty: Math.min(pans, 6), why: 'Hot food has to hold at 135°F or above right through service' });
  }
  if (platters) out.push({ item: 'Catering platters with dome lids', qty: platters, why: 'Croquetas and skewers travel and serve on platters' });
  out.push({ item: 'Serving tongs and spoons', qty: production.length + 2, why: 'One per dish, plus spares' });
  out.push({ item: 'Labels', qty: pans + platters, why: 'Every container gets the dish name, the allergens and the date' });
  out.push({ item: 'Food-safe gloves', qty: 1, why: 'A box for packing and a box for service' });
  out.push({ item: 'Foil, film and sheet liners', qty: 1, why: 'Covering everything for the drive' });
  return out;
}

// ---------------------------------------------------------------- the schedule

const HHMM = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? { h: Number(m[1]), m: Number(m[2]) } : null; };

/**
 * Tasks placed BACKWARDS from serving time — the only order in which a deadline is real. Anything
 * over two hours of cooking lands the day before, because a nine-hour pork does not start Saturday
 * morning; everything else stacks back from the moment the van has to leave.
 */
export function schedule({ eventDateMs, servingTime, production, guests, travelMinutes = 30, setupMinutes = 30, packMinutes = 45 }) {
  const t = HHMM(servingTime) || { h: 19, m: 0 };
  const serve = new Date(eventDateMs);
  serve.setHours(t.h, t.m, 0, 0);
  const serveAt = serve.getTime();
  const arriveAt = serveAt - setupMinutes * MIN;
  const leaveAt = arriveAt - travelMinutes * MIN;
  const packAt = leaveAt - packMinutes * MIN;

  const tasks = [];
  const add = (key, label, at, kind, minutes) => tasks.push({ key, label, at, kind, minutes: minutes || null });

  add('confirm', 'Confirm the final headcount, the address and the serving time with the customer', eventDateMs - 2 * DAY + 10 * 3600000, 'customer', 10);
  add('shop', 'Shop everything on the purchase list', eventDateMs - 2 * DAY + 8 * 3600000, 'purchasing', 120);
  add('balance', 'Collect the balance before service', eventDateMs - DAY + 9 * 3600000, 'money', 5);

  let cursor = packAt;
  for (const p of [...production].sort((a, b) => (b.minutes || 0) - (a.minutes || 0))) {
    const mins = p.minutes || 45;
    const dayBefore = mins > 120;
    const end = dayBefore ? (eventDateMs - DAY + 18 * 3600000) : cursor;
    add(`cook:${p.key}`,
      `${p.name} — ${p.portions ? p.portions + ' portions' : 'per the order'}${p.recipe ? '' : ' · no recipe on file'}`,
      end - mins * MIN, 'kitchen', mins);
    if (!dayBefore) cursor = end - mins * MIN;
  }

  add('pack', 'Pack, label and take the packing temperature of every pan', packAt, 'kitchen', packMinutes);
  add('depart', 'Load the van and leave', leaveAt, 'logistics', 15);
  add('arrive', 'Arrive, set the chafers up, temp every pan', arriveAt, 'logistics', setupMinutes);
  add('serve', `Service starts — ${guests} guests`, serveAt, 'service', null);
  return tasks.sort((a, b) => a.at - b.at);
}

/** What the schedule costs in labour, by day, rounded up to the quarter hour. */
export function laborEstimate(tasks) {
  const byDay = new Map();
  for (const t of tasks) {
    if (!t.minutes || t.kind === 'money' || t.kind === 'customer') continue;
    const d = new Date(t.at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cur = byDay.get(day) || { minutes: 0, from: t.at, to: t.at + t.minutes * MIN };
    cur.minutes += t.minutes;
    cur.from = Math.min(cur.from, t.at);
    cur.to = Math.max(cur.to, t.at + t.minutes * MIN);
    byDay.set(day, cur);
  }
  const days = [...byDay.entries()].sort().map(([day, v]) => ({ day, minutes: v.minutes, hours: Math.ceil(v.minutes / 15) / 4, from: v.from, to: v.to }));
  const total = days.reduce((n, d) => n + d.minutes, 0);
  return { days, total_minutes: total, total_hours: Math.ceil(total / 15) / 4 };
}

/** The drive: what goes in, what has to be true when it comes out. */
export function logistics(plan) {
  const hot = plan.production.filter((p) => !isPlatter(p.name));
  const cold = plan.production.filter((p) => isPlatter(p.name));
  return {
    address: plan.event.address,
    travel_minutes: 30,
    load: [
      ...hot.map((p) => ({ what: p.name, how: 'Hot — insulated carrier, 135°F or above' })),
      ...cold.map((p) => ({ what: p.name, how: 'Cold — cooler with ice packs, 41°F or below' })),
      { what: 'Chafers, fuel, serving utensils, labels', how: 'Loaded last, out first' },
    ],
    checks: [
      'Take and write down the temperature of every pan as it is packed.',
      'Take it again on arrival, before the first guest is served.',
      'Anything hot below 135°F or cold above 41°F does not get served.',
      'The final balance is collected before service starts.',
    ],
  };
}

/** The theme, turned into something the studio and the label printer can act on. */
export function designBrief(event, production) {
  if (!event.theme && !event.colors) return null;
  return {
    theme: event.theme || null,
    colors: event.colors || null,
    needs: [
      'A label for every pan and platter: dish name, allergens, date.',
      event.theme ? `A table sign or card in keeping with: ${event.theme}.` : null,
      event.colors ? `Hold to the customer's colours: ${event.colors}.` : null,
      `${production.length} dish names to set, in English and Spanish.`,
    ].filter(Boolean),
    dishes: production.map((p) => ({ en: p.name, es: p.name_es || null })),
  };
}

// ---------------------------------------------------------------- the whole plan

export async function eventPlan(env, quoteId, { atMs = Date.now() } = {}) {
  const quote = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(quoteId).first();
  if (!quote) return { ok: false, error: 'No event with that id.' };
  const q = parseJson(quote.quote_json, null) || {};
  const lines = Array.isArray(q.lines) ? q.lines : [];
  const guests = Number(quote.guests) || 0;

  const recipesRes = await env.DB.prepare('SELECT id, name, name_es, ingredients, ingredients_es, status, program_key, portion FROM recipes').all();
  const recipes = ((recipesRes && recipesRes.results) || []).map((r) => ({ ...r, ing: parseJson(r.ingredients, []) }));
  // cook_minutes ONLY. prep_minutes on the same row is a plating time — three minutes to assemble
  // one bowl of congrí on the line — and reading it as a batch cook time put congrí for thirty at
  // fifteen minutes on the first plan this ever built.
  const menuRes = await env.DB.prepare('SELECT name, cook_minutes FROM menu_items WHERE cook_minutes IS NOT NULL').all();
  const menuItems = (menuRes && menuRes.results) || [];
  const invRes = await env.DB.prepare('SELECT name, unit, on_hand FROM inventory_items WHERE active = 1').all();
  const inventory = (invRes && invRes.results) || [];

  const doneRes = await env.DB.prepare('SELECT task_key, done_at, done_by, note, minutes FROM event_tasks WHERE quote_id = ?').bind(quoteId).all();
  const done = new Map(((doneRes && doneRes.results) || []).map((r) => [r.task_key, r]));

  const production = lines.map((l, i) => {
    const recipe = matchRecipe(l, recipes);
    const portions = qtyOf(l) || guests;
    const words = [...dishWords(l.name), ...dishWords(l.name_es)];
    const mi = menuItems.find((m) => overlap(dishWords(m.name), words) >= 0.6);
    // Three sources, in order of who knows best: what the cook set on THIS event, what the kitchen
    // measured last time it made this dish, and — only when neither exists — a plain allowance
    // that is labelled a guess, because the HUB has never timed this dish and should not pretend.
    const override = done.get(`cook:l${i}`)?.minutes || null;
    const learned = mi ? Math.max(15, Math.round(mi.cook_minutes * Math.max(1, portions / 25))) : null;
    const minutes = override || learned || Math.max(30, Math.round(portions * 1.5));
    const minutesSource = override
      ? 'set by the kitchen for this event'
      : learned ? `the kitchen's own time for “${mi.name}” — ${mi.cook_minutes} min per 25`
        : 'a guess — nobody has timed this dish yet. Set the real time.';
    return {
      key: `l${i}`,
      name: l.name, name_es: l.name_es || null, detail: l.detail || null,
      qty: l.qty, portions, cents: l.cents || 0,
      recipe: recipe ? {
        id: recipe.id, name: recipe.name, status: recipe.status,
        draft: recipe.status !== 'published',
        // The adult day care cycle's recipes live in the same table. They are written to a
        // dietitian-approved portion for that contract, which is not a catering portion, so a
        // match against one is surfaced rather than used quietly.
        program: !!recipe.program_key, portion: recipe.portion || null,
      } : null,
      ingredients: recipe ? (recipe.ing || []).map((x) => ({ item: x.item, qty: scaleQty(x.qty, portions), basis: x.qty })) : [],
      minutes, minutes_source: minutesSource, minutes_is_guess: !override && !learned,
      needs_recipe: !recipe,
    };
  });

  const eventMs = Date.parse(String(quote.event_date) + 'T00:00:00') || atMs;
  const tasks = schedule({ eventDateMs: eventMs, servingTime: quote.serving_time, production, guests });

  const event = {
    quote_id: quote.id, customer: quote.customer_name,
    phone: quote.customer_phone || null, email: quote.customer_email || null,
    date: quote.event_date, serving_time: quote.serving_time || null,
    address: quote.address || null, theme: quote.theme || null, colors: quote.colors || null,
    dietary_notes: quote.dietary_notes || null, source_lead_id: quote.source_lead_id || null,
    guests, days_out: Math.ceil((eventMs - atMs) / DAY),
    total_cents: quote.total_cents, deposit_status: quote.deposit_status,
    deposit_paid_cents: quote.deposit_paid_cents, balance_cents: quote.balance_cents,
    balance_status: quote.balance_status, balance_due_date: quote.balance_due_date,
    final_count_due: quote.final_count_due,
  };

  const plan = {
    ok: true,
    event,
    production,
    shopping: shoppingList(production, inventory),
    packaging: packagingList(production, guests),
    // done_at, not the existence of a row: a row also exists when the cook has only set a time,
    // and knowing how long a dish takes is not the same as having made it.
    tasks: tasks.map((t) => {
      const r = done.get(t.key);
      return { ...t, done: !!(r && r.done_at), done_at: (r && r.done_at) || null, done_by: (r && r.done_by) || null, note: (r && r.note) || null };
    }),
    labor: laborEstimate(tasks),
    design: designBrief(event, production),
  };
  plan.logistics = logistics(plan);
  plan.gaps = [
    ...(quote.serving_time ? [] : ['No serving time on this event — the whole schedule below assumes 7:00 p.m. Set the real time.']),
    ...(quote.address ? [] : ['No delivery address on this event.']),
    ...production.filter((p) => p.needs_recipe).map((p) => `No recipe on file for “${p.name}” — its ingredients are missing from the purchase list.`),
    ...production.filter((p) => p.recipe && p.recipe.draft).map((p) => `The recipe for “${p.name}” is still a draft nobody has confirmed.`),
    ...production.filter((p) => p.recipe && p.recipe.program).map((p) => `“${p.name}” matched the adult day care program recipe${p.recipe.portion ? ` (${p.recipe.portion})` : ''} — that portion is the one the dietitian signed for the contract, not a catering portion. Check the amounts before cooking.`),
    ...(String(quote.balance_status) === 'due' ? [`The balance of $${((quote.balance_cents || 0) / 100).toFixed(2)} has not been collected.`] : []),
    ...(String(quote.deposit_status) !== 'paid' ? ['The deposit has not been paid — this event is not confirmed.'] : []),
  ];
  return plan;
}

/** Tick a task, or untick it. The only thing this module stores is what a person actually did. */
export async function setEventTask(env, { quote_id, task_key, done = true, note }, ctx) {
  if (!quote_id || !task_key) return { ok: false, error: 'Which task, on which event?' };
  const t = now();
  const who = (ctx && (ctx.email || ctx.distinct_id)) || null;
  const existing = await env.DB.prepare('SELECT id FROM event_tasks WHERE quote_id = ? AND task_key = ?').bind(quote_id, task_key).first();
  if (!done) {
    if (existing) await env.DB.prepare('DELETE FROM event_tasks WHERE id = ?').bind(existing.id).run();
    return { ok: true, done: false };
  }
  if (existing) {
    await env.DB.prepare('UPDATE event_tasks SET done_at = ?, done_by = ?, note = ? WHERE id = ?').bind(t, who, note || null, existing.id).run();
    return { ok: true, done: true };
  }
  await env.DB.prepare('INSERT INTO event_tasks (id, quote_id, task_key, done_at, done_by, note, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id('etask'), quote_id, task_key, t, who, note || null, t).run();
  return { ok: true, done: true };
}

/**
 * The cook's own time for a dish on this event — and, because the next event will make the same
 * dish again, the same number is remembered on the menu item as the kitchen's batch time. This is
 * the one direction data should flow: the person holding the pan tells the HUB how long it takes.
 */
export async function setCookMinutes(env, { quote_id, task_key, minutes, remember = true }) {
  if (!quote_id || !/^cook:l\d+$/.test(String(task_key || ''))) return { ok: false, error: 'That is not a dish on this plan.' };
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1 || m > 1440) return { ok: false, error: 'Minutes must be a number between 1 and 1440.' };

  const t = now();
  const existing = await env.DB.prepare('SELECT id FROM event_tasks WHERE quote_id = ? AND task_key = ?').bind(quote_id, task_key).first();
  if (existing) await env.DB.prepare('UPDATE event_tasks SET minutes = ? WHERE id = ?').bind(m, existing.id).run();
  else {
    await env.DB.prepare('INSERT INTO event_tasks (id, quote_id, task_key, minutes, created_at) VALUES (?,?,?,?,?)')
      .bind(id('etask'), quote_id, task_key, m, t).run();
  }
  if (!remember) return { ok: true, minutes: m, remembered: false };

  // Remember it against the menu item this line matched, normalised to a 25-portion batch.
  const quote = await env.DB.prepare('SELECT quote_json, guests FROM catering_quotes WHERE id = ?').bind(quote_id).first();
  const lines = (parseJson(quote && quote.quote_json, null) || {}).lines || [];
  const line = lines[Number(String(task_key).slice(6))];
  if (!line) return { ok: true, minutes: m, remembered: false };
  const portions = qtyOf(line) || Number(quote.guests) || 25;
  const perBatch = Math.max(1, Math.round(m / Math.max(1, portions / 25)));
  const words = [...dishWords(line.name), ...dishWords(line.name_es)];
  const menu = await env.DB.prepare('SELECT id, name FROM menu_items').all();
  const hit = ((menu && menu.results) || []).find((x) => overlap(dishWords(x.name), words) >= 0.6);
  if (!hit) return { ok: true, minutes: m, remembered: false, note: 'No menu item matches this line, so there is nowhere to remember it.' };
  await env.DB.prepare('UPDATE menu_items SET cook_minutes = ? WHERE id = ?').bind(perBatch, hit.id).run();
  return { ok: true, minutes: m, remembered: true, per_batch: perBatch, menu_item: hit.name };
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Set the facts a quote never captured: when, where, and what the customer asked it to look like. */
export async function setEventDetails(env, { quote_id, serving_time, address, theme, colors, dietary_notes, source_lead_id }) {
  if (!quote_id) return { ok: false, error: 'Which event?' };
  if (serving_time != null && serving_time !== '' && !TIME_RE.test(String(serving_time))) {
    return { ok: false, error: 'Serving time must be a 24-hour time like 19:00.' };
  }
  const sets = []; const vals = [];
  const put = (col, v) => { if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v === '' ? null : v); } };
  put('serving_time', serving_time); put('address', address); put('theme', theme);
  put('colors', colors); put('dietary_notes', dietary_notes); put('source_lead_id', source_lead_id);
  if (!sets.length) return { ok: false, error: 'Nothing to change.' };
  sets.push('updated_at = ?'); vals.push(now());
  vals.push(quote_id);
  await env.DB.prepare(`UPDATE catering_quotes SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return { ok: true };
}

/**
 * Design requests this event was plausibly quoted from. The 9/26 booking is the case in point: its
 * serving time, address and theme exist, written down, on the request it came from — and the quote
 * has none of them. Rather than retyping, the owner picks the brief and the facts come across.
 */
export async function briefCandidates(env, quote) {
  const r = await env.DB.prepare(
    `SELECT l.id, l.name, l.email, l.created_at, l.message, r.event_json
       FROM leads l LEFT JOIN catering_requests r ON r.lead_id = l.id
      WHERE l.kind = 'catering' ORDER BY l.created_at DESC LIMIT 40`
  ).all();
  const field = (msg, label) => {
    const line = String(msg || '').split('\n').find((x) => x.startsWith(`${label}:`));
    const v = line ? line.slice(label.length + 1).trim() : '';
    return v && v !== 'Not provided' && v !== 'None provided' && v !== 'None' ? v : null;
  };
  const out = [];
  for (const row of (r && r.results) || []) {
    const ev = parseJson(row.event_json, null) || {};
    const guests = Number(ev.guests) || Number(field(row.message, 'Guest count')) || null;
    const details = {
      serving_time: ev.event_time || field(row.message, 'Serving time'),
      address: field(row.message, 'Location'),
      theme: field(row.message, 'Event theme / occasion'),
      colors: field(row.message, 'Colors / special touches'),
      dietary_notes: ev.dietary_needs || field(row.message, 'Dietary needs / allergies'),
    };
    // Same headcount, and something operational to offer. Deliberately loose — the owner confirms.
    if (guests && quote && guests === Number(quote.guests) && Object.values(details).some(Boolean)) {
      out.push({ lead_id: row.id, from: row.name || row.email || null, created_at: row.created_at, guests, ...details });
    }
  }
  return out;
}

/** The booked events the kitchen should be looking at, soonest first. */
export async function upcomingEvents(env, { atMs = Date.now(), withinDays = 21 } = {}) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const r = await env.DB.prepare(
    `SELECT id, customer_name, event_date, serving_time, guests, total_cents, deposit_status, balance_status
       FROM catering_quotes
      WHERE event_date >= ? AND event_date <= ? AND deposit_status != 'void'
      ORDER BY event_date`
  ).bind(day(atMs - DAY), day(atMs + withinDays * DAY)).all();
  return ((r && r.results) || []).map((e) => ({
    ...e,
    days_out: Math.ceil((Date.parse(e.event_date + 'T00:00:00') - atMs) / DAY),
  }));
}
