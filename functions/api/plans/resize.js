// POST /api/plans/resize — stateless recompute of bowl sizing + pricing from edited macros.
// Used when an individual adjusts their AI-generated macros on the plan page (no account / no
// saved plan). Returns the same sizing block the generator produces, so the page re-renders the
// new bowl size, per-bowl macros, per-bowl price, and 5/10/12 plan options. No DB writes.
import { json, bad } from '../../_lib/util.js';
import { computeSizing } from '../../_lib/sizing.js';

export const onRequestPost = async ({ request }) => {
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const cal = Math.round(Number(b.daily_calories));
  if (!cal || cal < 800 || cal > 6000) return bad('Daily calories must be between 800 and 6000.');
  return json(computeSizing(cal, b.meals_per_day));
};

export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
