// The adult day care meal program: what is cooked today, by whom, at what portions, and what the
// rest of the HUB is allowed to say about it. Files under functions/_lib are NOT routed.
//
// WHY THIS FILE EXISTS. A compliance menu lives or dies on whether the person cooking can follow it
// on a Tuesday morning. Printed in a binder it is a document; here it is the screen the cook works
// from, with the same portions and temperatures the dietitian signed and the facility keeps on file.
//
// One source, three audiences:
//   · the kitchen  — today's dishes, the recipe card, the prep clock, the temperatures to record
//   · the facility — the delivery slip, built from what was actually packed and delivered
//   · every agent  — a short, factual block (programContext) so Aña, the marketing team, the chief
//                    of staff and the Studio describe this service the same way, or say nothing
//
// THE HONESTY RULE. A cycle is only servable when a Florida-licensed dietitian has signed it
// (Rule 59A-16.105). Until those fields are filled in, `servable` is false and every consumer —
// the kitchen screen included — says so plainly rather than implying an approval that does not exist.
import { id, now, parseJson } from './hub.js';

export const MEALS = ['breakfast', 'lunch', 'snack'];
export const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_MS = 86400000;

/** YYYY-MM-DD → {y,m,d} in plain numbers, with no timezone games. */
function ymd(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
const toUTC = (s) => { const p = ymd(s); return p ? Date.UTC(p.y, p.m - 1, p.d) : null; };

/**
 * Which slot of the cycle a date falls in, counted from the day service started.
 *
 * Counted in WEEKS ELAPSED, not in service days: a holiday closure must not shift the whole cycle
 * by a day and silently serve Tuesday's menu on Wednesday for the rest of the contract. Weekends
 * are not service days and return null rather than Monday's menu.
 */
export function slotFor(dateStr, { startedOn, weeks = 4 } = {}) {
  const t = toUTC(dateStr);
  if (t == null) return null;
  const dow = new Date(t).getUTCDay();            // 0=Sun..6=Sat
  if (dow === 0 || dow === 6) return null;
  const anchor = toUTC(startedOn) ?? t;
  // Monday of each week, so a contract that starts on a Wednesday still has a whole week 1.
  const mondayOf = (ms) => { const d = new Date(ms).getUTCDay(); return ms - ((d + 6) % 7) * DAY_MS; };
  const diffWeeks = Math.floor((mondayOf(t) - mondayOf(anchor)) / (7 * DAY_MS));
  const w = ((diffWeeks % weeks) + weeks) % weeks + 1;
  return { week: w, dow, dow_key: DOW_KEYS[dow - 1] };
}

// The one sentence that stops service, in the language of whoever is being stopped.
const NOT_SERVABLE = {
  en: 'This cycle has not been signed by a Florida-licensed dietitian yet. Rule 59A-16.105 requires the reviewer\'s name, license number and date on file before the facility may serve it.',
  es: 'Este ciclo todavía no está firmado por una dietista licenciada en Florida. La Regla 59A-16.105 exige el nombre, el número de licencia y la fecha de quien lo revisó antes de que el centro pueda servirlo.',
};

export async function activeCycle(env, cycleId, { lang = 'en' } = {}) {
  const sql = cycleId
    ? 'SELECT * FROM program_cycles WHERE id = ?'
    : 'SELECT * FROM program_cycles WHERE active = 1 ORDER BY created_at LIMIT 1';
  const stmt = cycleId ? env.DB.prepare(sql).bind(cycleId) : env.DB.prepare(sql);
  const row = await stmt.first();
  if (!row) return null;
  const servable = !!(row.dietitian_name && row.dietitian_license && row.reviewed_at);
  return {
    ...row,
    servable,
    // Said once, here, so no screen has to invent its own wording for it.
    not_servable_reason: servable ? null : (NOT_SERVABLE[lang] || NOT_SERVABLE.en),
  };
}

/** The cycle rows for one slot, newest recipe data joined in. */
export async function itemsForSlot(env, cycleId, week, dow) {
  const r = await env.DB.prepare(
    `SELECT i.*, r.name AS recipe_name, r.name_es AS recipe_name_es, r.portion, r.portion_es,
            r.ingredients, r.ingredients_es, r.steps, r.steps_es, r.summary, r.summary_es
       FROM program_cycle_items i
       LEFT JOIN recipes r ON r.id = i.recipe_id
      WHERE i.cycle_id = ? AND i.week = ? AND i.dow = ?`
  ).bind(cycleId, week, dow).all();
  const rows = (r && r.results) || [];
  const order = { breakfast: 0, lunch: 1, snack: 2 };
  return rows.sort((a, b) => (order[a.meal] ?? 9) - (order[b.meal] ?? 9)).map((x) => ({
    id: x.id, meal: x.meal, dish: x.dish, recipe_id: x.recipe_id,
    components: parseJson(x.components, []), allergens: x.allergens || null,
    portion: x.portion || null, portion_es: x.portion_es || null,
    recipe: x.recipe_id ? {
      id: x.recipe_id, name: x.recipe_name, name_es: x.recipe_name_es,
      summary: x.summary, summary_es: x.summary_es,
      ingredients: parseJson(x.ingredients, []), ingredients_es: parseJson(x.ingredients_es, []),
      steps: parseJson(x.steps, []), steps_es: parseJson(x.steps_es, []),
    } : null,
  }));
}

/**
 * Ingredient quantities scaled from the recipe's 45-portion basis to today's count.
 *
 * Quantities are strings a cook wrote ("12 lb raw", "6 cups", "4 dozen"), so the leading number is
 * scaled and the rest is left alone. A quantity with no number ("one set", "per mix") is returned
 * untouched — inventing a number there would be worse than saying "as needed".
 */
const FRACTION = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
export function scaleQty(qty, count, basis = 45) {
  const s = String(qty == null ? '' : qty);
  const f = count / basis;
  if (!Number.isFinite(f) || f <= 0) return s;
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔])?\s*(.*)$/);
  if (!m || (!m[1] && !m[2])) return s;
  const base = (m[1] ? Number(m[1]) : 0) + (m[2] ? FRACTION[m[2]] : 0);
  const v = base * f;
  const pretty = v >= 10 ? String(Math.round(v))
    : v >= 1 ? String(Math.round(v * 4) / 4)
      : String(Math.round(v * 8) / 8);
  return `${pretty} ${m[3]}`.trim();
}

export function scaleRecipe(recipe, count, lang = 'en') {
  if (!recipe) return null;
  const ing = (lang === 'es' ? recipe.ingredients_es : recipe.ingredients) || recipe.ingredients || [];
  return {
    name: (lang === 'es' && recipe.name_es) || recipe.name,
    summary: (lang === 'es' && recipe.summary_es) || recipe.summary,
    steps: ((lang === 'es' ? recipe.steps_es : recipe.steps) || recipe.steps || []),
    ingredients: ing.map((x) => ({ item: x.item, qty: scaleQty(x.qty, count), qty_basis: x.qty })),
    basis: 45, scaled_to: count,
  };
}

/** Sites eating this program on a date, with the headcount already submitted for that day. */
export async function sitesForDate(env, dateStr) {
  const r = await env.DB.prepare(
    `SELECT s.id, s.name, s.account_id, s.program_cycle_id, s.program_started_on, s.delivery_window,
            s.window_label, s.cutoff_time, o.headcount, o.is_rush, o.notes
       FROM contract_sites s
       LEFT JOIN contract_orders o ON o.site_id = s.id AND o.service_date = ?
      WHERE s.active = 1 AND s.program_cycle_id IS NOT NULL`
  ).bind(dateStr).all();
  return (r && r.results) || [];
}

/**
 * Everything the kitchen screen needs for one date: per site, the slot, the dishes, the scaled
 * recipes, and what has already been logged.
 */
export async function serviceDay(env, dateStr, { lang = 'en' } = {}) {
  const sites = await sitesForDate(env, dateStr);
  const out = [];
  for (const s of sites) {
    const cycle = await activeCycle(env, s.program_cycle_id, { lang });
    if (!cycle) continue;
    const slot = slotFor(dateStr, { startedOn: s.program_started_on, weeks: cycle.weeks });
    if (!slot) continue;                 // weekend, or a date the cycle does not cover
    const items = await itemsForSlot(env, cycle.id, slot.week, slot.dow);
    const logged = await env.DB.prepare(
      'SELECT * FROM program_service_log WHERE site_id = ? AND service_date = ?'
    ).bind(s.id, dateStr).all();
    const byMeal = {};
    for (const l of (logged && logged.results) || []) byMeal[l.meal] = l;
    const count = Number(s.headcount) || 0;
    out.push({
      site: { id: s.id, name: s.name, window: s.window_label || s.delivery_window || null, cutoff: s.cutoff_time || null },
      cycle: { id: cycle.id, name: cycle.name, week: slot.week, dow_key: slot.dow_key, servable: cycle.servable,
               not_servable_reason: cycle.not_servable_reason,
               dietitian: cycle.dietitian_name ? { name: cycle.dietitian_name, credentials: cycle.dietitian_credentials, license: cycle.dietitian_license } : null },
      headcount: count,
      headcount_known: s.headcount != null,
      items: items.map((it) => ({
        ...it,
        scaled: it.recipe ? scaleRecipe(it.recipe, count || 45, lang) : null,
        log: byMeal[it.meal] || null,
      })),
    });
  }
  return { date: dateStr, sites: out };
}

/** Record what was packed and delivered. This row IS the delivery slip. */
export async function logService(env, { site_id, service_date, meal, dish, cycle_week, count_ordered,
  count_delivered, temp_pack_f, temp_delivery_f, substitution, packed_by, delivered_by, received_by, notes }, ctx) {
  if (!site_id || !service_date || !MEALS.includes(String(meal))) return { ok: false, error: 'Site, date and meal are required.' };
  const t = now();
  const existing = await env.DB.prepare(
    'SELECT id FROM program_service_log WHERE site_id = ? AND service_date = ? AND meal = ?'
  ).bind(site_id, service_date, meal).first();
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const fields = {
    dish: dish ?? null, cycle_week: num(cycle_week), count_ordered: num(count_ordered), count_delivered: num(count_delivered),
    temp_pack_f: num(temp_pack_f), temp_delivery_f: num(temp_delivery_f), substitution: substitution ?? null,
    packed_by: packed_by ?? (ctx && ctx.distinct_id) ?? null, delivered_by: delivered_by ?? null,
    received_by: received_by ?? null, notes: notes ?? null,
  };
  if (existing) {
    const keys = Object.keys(fields).filter((k) => fields[k] !== null);
    if (!keys.length) return { ok: true, id: existing.id, updated: false };
    await env.DB.prepare(`UPDATE program_service_log SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`)
      .bind(...keys.map((k) => fields[k]), t, existing.id).run();
    return { ok: true, id: existing.id, updated: true };
  }
  const rid = id('pslog');
  const cols = ['id', 'site_id', 'service_date', 'meal', ...Object.keys(fields), 'created_at', 'updated_at'];
  const vals = [rid, site_id, service_date, meal, ...Object.keys(fields).map((k) => fields[k]), t, t];
  await env.DB.prepare(`INSERT INTO program_service_log (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...vals).run();
  return { ok: true, id: rid, updated: false };
}

/**
 * What to buy for a date range at a given headcount, aggregated across every recipe in those slots.
 *
 * Deliberately returns the INGREDIENT LINES, not a shopping cart with prices: the price is whatever
 * Restaurant Depot charges that morning, and a number this file invents would be wrong by the time
 * anyone reads it.
 */
export async function purchaseList(env, { cycleId, weeks = [1], headcount = 45 } = {}) {
  const cycle = await activeCycle(env, cycleId);
  if (!cycle) return { ok: false, error: 'No program cycle found.' };
  const ph = weeks.map(() => '?').join(',');
  const r = await env.DB.prepare(
    `SELECT i.week, i.dow, i.meal, i.dish, r.ingredients
       FROM program_cycle_items i JOIN recipes r ON r.id = i.recipe_id
      WHERE i.cycle_id = ? AND i.week IN (${ph})`
  ).bind(cycle.id, ...weeks).all();
  const lines = new Map();
  for (const row of (r && r.results) || []) {
    for (const ing of parseJson(row.ingredients, [])) {
      const key = String(ing.item).toLowerCase();
      const cur = lines.get(key) || { item: ing.item, parts: [], dishes: [] };
      cur.parts.push(scaleQty(ing.qty, headcount));
      if (!cur.dishes.includes(row.dish)) cur.dishes.push(row.dish);
      lines.set(key, cur);
    }
  }
  return {
    ok: true, cycle: cycle.name, weeks, headcount,
    lines: [...lines.values()].map((l) => ({ item: l.item, quantities: l.parts, dishes: l.dishes })),
  };
}

// ---------------------------------------------------------------- what every agent may say

const MAX_CONTEXT = 2200;

/**
 * The short, factual block about this service for Aña, the marketing team, the chief of staff and
 * the Studio. Facts only, from the database, so nobody invents a claim about compliance or a price.
 * Returns '' when there is no program configured, which keeps it out of every prompt until there is.
 */
export async function programContext(env, { lang = 'en' } = {}) {
  let cycle = null;
  try { cycle = await activeCycle(env); } catch { return ''; }
  if (!cycle) return '';
  let counts = { dishes: 0, weeks: cycle.weeks };
  try {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM program_cycle_items WHERE cycle_id = ?').bind(cycle.id).first();
    counts.dishes = Number((c && c.n) || 0);
  } catch { /* count is a nicety */ }
  const lines = [];
  if (lang === 'es') {
    lines.push('SERVICIO DE COMIDAS PARA CENTROS DE CUIDADO DIURNO DE ADULTOS (hechos, no promesas):');
    lines.push(`· Menú de ciclo de ${cycle.weeks} semanas: desayuno, almuerzo y merienda, de lunes a viernes, ${counts.dishes} comidas planificadas para adultos de 80+ años.`);
    lines.push('· Planificado según la Regla 59A-16.105 de Florida y el patrón de comidas para adultos del USDA: cada comida aporta al menos un tercio de las DRI.');
    lines.push('· Dietas: carbohidrato consistente, bajo en sodio, texturas IDDSI 6, 5 y 4, sin cerdo, y alternativas para alergias a leche, trigo, huevo y soya. El ciclo no lleva maní ni nueces.');
    lines.push('· Entregado en envases individuales listos para servir, sin recalentar, con temperaturas registradas en cada entrega.');
  } else {
    lines.push('ADULT DAY CARE MEAL SERVICE (facts, not promises):');
    lines.push(`· ${cycle.weeks}-week cycle menu: breakfast, lunch and an afternoon snack, Monday to Friday, ${counts.dishes} planned meals for adults 80+.`);
    lines.push('· Planned to Florida Rule 59A-16.105 and the USDA adult meal pattern: each meal provides at least one third of the Dietary Reference Intakes.');
    lines.push('· Diets: consistent carbohydrate, low sodium, IDDSI levels 6, 5 and 4, a no-pork version, and alternatives for milk, wheat, egg and soy allergies. The cycle contains no peanuts or tree nuts.');
    lines.push('· Delivered in individual ready-to-serve containers, no reheating, with temperatures recorded at every delivery.');
  }
  if (cycle.servable) {
    const d = `${cycle.dietitian_name}${cycle.dietitian_credentials ? ', ' + cycle.dietitian_credentials : ''} (FL license ${cycle.dietitian_license})`;
    lines.push(lang === 'es'
      ? `· Menú revisado y firmado por ${d}.`
      : `· Menu reviewed and signed by ${d}.`);
  } else {
    // The one thing an agent must never imply.
    lines.push(lang === 'es'
      ? '· IMPORTANTE: el menú AÚN NO está firmado por una dietista licenciada. No digas que está aprobado ni que el servicio puede comenzar; di que la revisión está en proceso.'
      : '· IMPORTANT: the menu is NOT yet signed by a licensed dietitian. Do not say it is approved or that service can begin; say the review is in progress.');
  }
  return lines.join('\n').slice(0, MAX_CONTEXT);
}
