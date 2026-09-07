import { currentWeek } from './ai_budget.js';
import { id } from './util.js';

export const THEME_PROMPT_MAX = 500;
export const THEME_RESERVATION_MICRO = 90_000;

export function cleanThemePrompt(value) {
  const safe = [...String(value == null ? '' : value)].map((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 || code === 127) ? ' ' : char;
  }).join('');
  return safe
    .replace(/\s+/g, ' ').trim().slice(0, THEME_PROMPT_MAX);
}

export function sameOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // direct navigation / same-origin form without Origin
  try {
    const expected = (env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, '');
    return new URL(origin).origin === expected;
  } catch { return false; }
}

// A conditional INSERT is the strongest reservation available without a new table: D1's
// single statement is atomic, so concurrent previews cannot all pass the same SUM check.
export async function reserveThemeBudget(env) {
  if (!env || !env.DB) return { ok: false, reason: 'budget_unavailable' };
  const week = currentWeek();
  const reservationId = id('cajita_theme');
  try {
    const result = await env.DB.prepare(
      `INSERT INTO ai_spend
       (id, week, day, feature, model, input_tokens, output_tokens, cost_microdollars, created_at)
       SELECT ?, ?, date('now'), 'cajita_theme_reservation', 'reservation', 0, 0, ?, ?
       WHERE COALESCE((SELECT SUM(cost_microdollars) FROM ai_spend WHERE week=?), 0) + ? < 50000000`
    ).bind(reservationId, week, THEME_RESERVATION_MICRO, Date.now(), week, THEME_RESERVATION_MICRO).run();
    if (!result || !(result.meta && result.meta.changes === 1)) return { ok: false, reason: 'weekly_ai_budget_reached' };
    return { ok: true, reservationId };
  } catch { return { ok: false, reason: 'budget_unavailable' }; }
}

export async function releaseThemeReservation(env, reservationId) {
  if (!env || !env.DB || !reservationId) return;
  try { await env.DB.prepare('DELETE FROM ai_spend WHERE id=? AND feature=?').bind(reservationId, 'cajita_theme_reservation').run(); } catch {}
}

export function themeCore(prompt) {
  return {
    positive: `A refined, photorealistic decorative background and subtle repeating pattern for a Cuban meal-box catering configurator. Customer theme direction: “${prompt}”. Use only abstract color, texture, botanical or geometric atmosphere; keep the center and generous lower foreground calm and usable for compositing a real meal box. ${prompt}`,
    negative: 'logos, wordmarks, emblems, brand marks, text, lettering, typography, numbers, signage, labels, menus, packaging mockups, plates, bowls, food, people, hands, faces, watermarks, borders, clutter, UI, gradients that obscure the center',
    source: 'cajita-theme', cached: false,
  };
}

export function dataUrlFromBytes(bytes, contentType) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:${contentType || 'image/jpeg'};base64,${btoa(binary)}`;
}

export function capability(env) {
  return { available: env && env.CAJITA_AI_PREVIEW_ENABLED === 'true' && !!(env.DB && env.MEDIA && env.SESSIONS), budget: 'shared_weekly_50_usd' };
}

export async function strictRateLimit(env, request) {
  if (!env || !env.SESSIONS) return { ok: false, unavailable: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const win = 3600;
  const bucket = Math.floor(Date.now() / (win * 1000));
  const key = `rl:cajita-theme:${ip}:${bucket}`;
  try {
    const count = parseInt((await env.SESSIONS.get(key)) || '0', 10) || 0;
    if (count >= 3) return { ok: false, retryAfter: win };
    await env.SESSIONS.put(key, String(count + 1), { expirationTtl: win + 5 });
    return { ok: true };
  } catch { return { ok: false, unavailable: true }; }
}
