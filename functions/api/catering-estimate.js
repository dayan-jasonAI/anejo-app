import { json } from '../_lib/util.js';
import { loadMenu } from '../_lib/menu.js';
import { normalizeCateringProducts } from '../_lib/catering-products.js';
import { estimateCateringProducts } from '../_lib/catering-estimate.js';
import { limitOr429 } from '../_lib/ratelimit.js';

export async function onRequestPost({ request, env }) {
  const limited = await limitOr429(env, request, { name: 'catering-estimate', limit: 90, windowSec: 60 });
  if (limited) return limited;
  const reply = (body, status = 200) => {
    const response = json(body, status);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  let body;
  try { const raw = await request.text(); if (raw.length > 40000) return reply({ error: 'Selection too large.' }, 413); body = JSON.parse(raw); } catch { return reply({ error: 'Invalid selection.' }, 400); }
  const selection = normalizeCateringProducts(body?.products, ['Añejo Fit Menu', 'Cuban Food', 'Individual Cajitas']);
  if (!selection.ok || !selection.items.length) return reply({ error: selection.error || 'Choose products.' }, 400);
  const menu = await loadMenu(env);
  const estimate = estimateCateringProducts(selection.items, menu, { needsReview: body.needs_review !== false });
  // Fit customization still belongs in the bowl editor; never drop its modifiers in transfer.
  if (selection.items.some(item => item.id.startsWith('fit-'))) estimate.checkout_eligible = false;
  return reply({ ...estimate, minimum_notice_hours: 48, custom_printing_notice_hours: 72, currency: 'USD' });
}
