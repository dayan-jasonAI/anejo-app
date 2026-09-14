// /api/hub/owner/daily — the Añejo Daily desk (OWNER ONLY).
//
//   GET                                        → settings, meals, the next 14 days, today's + tomorrow's production
//   POST { op:'set_day', date, menu_item_id, allocation?, cutoff_time?, note? }
//   POST { op:'cancel_day', date }             → only a day with nothing sold or in checkout
//   POST { op:'release_holds', date }          → hand back every UNPAID hold on a date (paid never)
//   POST { op:'save_settings', cutoff_time?, default_allocation?, tiers? }
//   POST { op:'save_delivery', base_fee_cents?, mileage_rate_cents?, distance_policy? }
//
// The allocation is the owner's number and only ever the owner's: nothing here or anywhere else
// raises it automatically, and it can never be set below what is already sold or in checkout.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { addEtDays } from '../../../_lib/hub.js';
import { etParts } from '../../../_lib/ondemand.js';
import {
  DAILY_KIND, loadDailySettings, saveDailySettings, dayView, setDay, cancelDay, releaseHolds, productionFor, isTierPrice,
} from '../../../_lib/daily.js';
import { loadDeliverySettings, saveDeliverySettings, mileageStatus, DISTANCE_POLICIES } from '../../../_lib/delivery_fee.js';
import { resolveContractMeal } from '../../../_lib/contract.js';

async function institutionalHint(env, dateStr, accounts) {
  const out = [];
  for (const a of accounts) {
    const m = await resolveContractMeal(env, a, dateStr);
    if (m && m.meal_id) out.push({ account_id: a.id, meal_id: m.meal_id, name: m.name });
  }
  return out;
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const settings = await loadDailySettings(env);
  const ds = await loadDeliverySettings(env);
  let meals = [];
  try {
    meals = ((await env.DB.prepare(
      "SELECT id, name, name_es, price_cents, unit_cost_cents, description, image, active, availability FROM menu_items WHERE kind = ? ORDER BY sort, name"
    ).bind(DAILY_KIND).all()).results || []).map((m) => ({ ...m, tier_ok: isTierPrice(settings, m.price_cents) }));
  } catch { meals = []; }
  let accounts = [];
  try { accounts = ((await env.DB.prepare("SELECT id, name FROM contract_accounts WHERE status = 'active' ORDER BY name").all()).results) || []; } catch { accounts = []; }

  const today = etParts(new Date()).dateStr;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const date = addEtDays(today, i);
    const view = await dayView(env, date, { settings });
    days.push({ date, weekday: new Date(date + 'T12:00:00Z').getUTCDay(), view, institutional: await institutionalHint(env, date, accounts) });
  }
  return json({
    ok: true, settings, meals,
    delivery: { settings: ds, status: mileageStatus(env, ds), policies: DISTANCE_POLICIES },
    days,
    production: { today: { date: today, rows: await productionFor(env, today) }, tomorrow: { date: addEtDays(today, 1), rows: await productionFor(env, addEtDays(today, 1)) } },
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const by = ctx.email || ctx.distinct_id || 'owner';
  const reply = (r) => (r && r.ok ? json(r) : json({ ok: false, error: (r && r.error) || 'validation failed', errors: r && r.errors }, 400));
  switch (String((b && b.op) || '')) {
    case 'set_day': return reply(await setDay(env, { date: b.date, menu_item_id: b.menu_item_id, allocation: b.allocation, cutoff_time: b.cutoff_time, note: b.note, by }));
    case 'cancel_day': return reply(await cancelDay(env, { date: b.date, by }));
    case 'release_holds': return reply(await releaseHolds(env, { date: b.date, by }));
    case 'save_settings': return reply(await saveDailySettings(env, b, by));
    case 'save_delivery': return reply(await saveDeliverySettings(env, b, by));
    default: return bad('Unknown action.');
  }
};
