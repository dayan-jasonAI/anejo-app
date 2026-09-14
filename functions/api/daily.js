// GET /api/daily — the public Añejo Daily snapshot: today's featured lunch, the next scheduled one,
// what is left, the cutoff, the delivery-fee floor, and the drinks that can ride along.
//
// Display only — checkout re-checks every rule and claims the portion atomically. Never cached: the
// remaining count moves with every order, and a stale "3 left" on a sold-out day is a broken promise.
// Carries nothing institutional: no account, no headcount, no contract data, ever.
import { json } from '../_lib/util.js';
import { loadDailySettings, publicDaily } from '../_lib/daily.js';
import { loadDeliverySettings, mileageStatus } from '../_lib/delivery_fee.js';
import { loadMenu, isAvailable } from '../_lib/menu.js';

export const onRequestGet = async ({ env }) => {
  const settings = await loadDailySettings(env);
  const d = await publicDaily(env, { settings });
  const ds = await loadDeliverySettings(env);
  let drinks = [];
  try {
    const menu = await loadMenu(env);
    drinks = (menu.items || [])
      .filter((it) => it.kind === 'drink' && isAvailable(it))
      .map((it) => ({ id: it.id, name: it.name, name_es: it.name_es || it.name, price_cents: it.price_cents, img: it.image || null, group: it.group_key || (String(it.id).startsWith('fit_') ? 'fit' : null) }));
  } catch { drinks = []; }
  // ALLOCATION IS DROPPED HERE. publicDaily() carries it because the Marketing Team is allowed to
  // know how big the day is; this endpoint is anonymous and pollable, and shipping `allocation`
  // beside `remaining` would make the subtraction a live count of exactly what Añejo sold today.
  // No storefront surface uses it — daily-card.js reads `remaining` and nothing else.
  const strip = (v) => { if (!v) return null; const { allocation: _allocation, ...rest } = v; return rest; };
  return json({
    ok: true,
    today: strip(d.today),
    next: strip(d.next),
    cutoff_label: d.cutoff_label,
    delivery: { base_fee_cents: ds.base_fee_cents, distance_based: mileageStatus(env, ds).active },
    drinks,
  }, 200, { 'Cache-Control': 'no-store' });
};
