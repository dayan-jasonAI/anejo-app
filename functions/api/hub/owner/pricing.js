// GET/POST /api/hub/owner/pricing — the cost inputs behind every Añejo quote.
//
// Dayan's requirement 2026-07-20: "If anything changes in the future i should be able to modify
// it through the Anejo CRM/HUB." So the numbers live in D1 and are edited here — never
// hardcoded, never requiring a deploy to change a price.
//
// GET  → current config + a worked quote at several headcounts, so a change is seen in dollars
//        before it is saved. A pricing screen that shows only inputs makes you guess the output.
// POST → validate, save, and return the same preview recomputed.
//
// PROVENANCE SURVIVES EDITS: every field carries "measured" or "provisional". Editing a field
// promotes it to measured, because Dayan typing a real figure IS the measurement. The seed
// values were mostly illustrative placeholders he accepted as a starting point, and a future
// session must be able to tell those apart from numbers he actually weighed.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { buildQuote, validateInputs, depositFor } from '../../../_lib/quote.js';

const FIELDS = [
  'food_cost_per_head', 'labor_rate_per_hour', 'hours_per_event', 'guests_per_staff',
  'packaging_per_head', 'overhead_per_event', 'target_food_cost_pct', 'target_net_margin',
  'deposit_pct', 'mileage_rate',
];

/** D1 row (snake_case, dollars) → the quote engine's camelCase input shape. */
export function toEngineInputs(row) {
  if (!row) return {};
  return {
    foodCostPerHead: row.food_cost_per_head,
    laborRatePerHour: row.labor_rate_per_hour,
    hoursPerEvent: row.hours_per_event,
    guestsPerStaff: row.guests_per_staff,
    packagingPerHead: row.packaging_per_head,
    overheadPerEvent: row.overhead_per_event,
    targetFoodCostPct: row.target_food_cost_pct,
    targetNetMargin: row.target_net_margin,
    ...(row.mileage_rate != null ? { mileageRate: row.mileage_rate } : {}),
  };
}

async function loadConfig(env) {
  try { return await env.DB.prepare('SELECT * FROM pricing_config WHERE id = 1').first(); }
  catch (_) { return null; }
}

/** Worked quotes at real headcounts — the point of a pricing screen is to see the price. */
function preview(row) {
  const inputs = toEngineInputs(row);
  const v = validateInputs(inputs);
  if (!v.ok) return { ok: false, missing: v.missing, invalid: v.invalid };
  return {
    ok: true,
    rows: [25, 50, 100, 200].map((g) => {
      const q = buildQuote(inputs, g);
      const d = depositFor(q, row.deposit_pct);
      return {
        guests: g, perHead: q.perHead, total: q.total,
        staff: q.breakdown.staffNeeded,
        foodPct: q.checks.impliedFoodCostPct,
        flag: q.checks.flag,
        deposit: d.ok ? d.deposit : null,
      };
    }),
  };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const row = await loadConfig(env);
  if (!row) return json({ ok: false, error: 'pricing_config missing — apply migration 0041' }, 501);
  let provenance = {};
  try { provenance = JSON.parse(row.provenance_json || '{}'); } catch (_) {}
  return json({ ok: true, config: row, provenance, preview: preview(row) });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const current = await loadConfig(env);
  if (!current) return json({ ok: false, error: 'pricing_config missing — apply migration 0041' }, 501);

  let provenance = {};
  try { provenance = JSON.parse(current.provenance_json || '{}'); } catch (_) {}

  const next = { ...current };
  const errors = [];
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const raw = body[f];
    if (raw === null || raw === '') {           // explicit clear (mileage_rate only)
      if (f !== 'mileage_rate') { errors.push(`${f} cannot be empty`); continue; }
      next[f] = null; provenance[f] = 'cleared by Dayan'; continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${f} must be a non-negative number`); continue; }
    // Percentages are FRACTIONS. Typing 30 instead of 0.30 would compute a wildly wrong price,
    // so it is refused here rather than silently "corrected" into a guess about intent.
    if (/_pct$|_margin$/.test(f) && (n <= 0 || n >= 1)) {
      errors.push(`${f} must be a fraction between 0 and 1 (0.30 = 30%), got ${n}`); continue;
    }
    if (f === 'guests_per_staff' && n <= 0) { errors.push('guests_per_staff must be greater than 0'); continue; }
    next[f] = n;
    // Dayan typing a real figure IS the measurement.
    provenance[f] = 'measured — entered by Dayan via Hub';
  }
  if (errors.length) return json({ ok: false, error: 'validation failed', errors }, 400);

  await env.DB.prepare(
    `UPDATE pricing_config SET food_cost_per_head=?, labor_rate_per_hour=?, hours_per_event=?,
       guests_per_staff=?, packaging_per_head=?, overhead_per_event=?, target_food_cost_pct=?,
       target_net_margin=?, deposit_pct=?, mileage_rate=?, provenance_json=?, updated_at=?, updated_by=?
     WHERE id = 1`
  ).bind(
    next.food_cost_per_head, next.labor_rate_per_hour, next.hours_per_event, next.guests_per_staff,
    next.packaging_per_head, next.overhead_per_event, next.target_food_cost_pct,
    next.target_net_margin, next.deposit_pct, next.mileage_rate,
    JSON.stringify(provenance), Date.now(), String(ctx.email || ctx.role || 'owner').slice(0, 120),
  ).run();

  const saved = await loadConfig(env);
  return json({ ok: true, config: saved, provenance, preview: preview(saved) });
};
