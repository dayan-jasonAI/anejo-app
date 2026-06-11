// /api/client/log — member self-tracking (meal done/skipped + weight check-in).
//   GET  -> recent meal + weight logs for the signed-in member
//   POST -> add one  { kind:'meal', consumed, bowl_name?, note?, date? }
//                    { kind:'weight', weight_lb|weight_kg, note?, date? }
import { json, bad, id, now } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

async function resolveClient(env, sess) {
  return env.DB.prepare('SELECT id FROM clients WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(sess.email).first();
}
const today = () => new Date().toISOString().slice(0, 10);
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : today();

export const onRequestGet = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client') return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);
  const c = await resolveClient(env, sess);
  if (!c) return json({ meals: [], weights: [] });
  const meals = (await env.DB.prepare(
    'SELECT date, bowl_name, consumed, note, logged_at FROM meal_logs WHERE client_id = ? ORDER BY date DESC, logged_at DESC LIMIT 30'
  ).bind(c.id).all()).results || [];
  const weights = (await env.DB.prepare(
    'SELECT date, weight_kg, note, logged_at FROM weight_logs WHERE client_id = ? ORDER BY date DESC, logged_at DESC LIMIT 30'
  ).bind(c.id).all()).results || [];
  return json({ meals, weights });
};

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'client-log', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client') return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const c = await resolveClient(env, sess);
  if (!c) return bad('No member record is linked to your account yet.', 404);
  const t = now();
  const date = validDate(b.date);

  if (b.kind === 'meal') {
    await env.DB.prepare('INSERT INTO meal_logs (id, client_id, date, bowl_name, consumed, note, logged_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id('ml'), c.id, date, (b.bowl_name || '').trim() || null, b.consumed ? 1 : 0, (b.note || '').trim() || null, t).run();
    return json({ ok: true });
  }
  if (b.kind === 'weight') {
    const kg = b.weight_kg != null ? Number(b.weight_kg)
      : b.weight_lb != null ? +(Number(b.weight_lb) * 0.4535924).toFixed(1) : null;
    if (!kg || kg < 25 || kg > 320) return bad('Please enter a valid weight.');
    await env.DB.prepare('INSERT INTO weight_logs (id, client_id, date, weight_kg, note, logged_at) VALUES (?,?,?,?,?,?)')
      .bind(id('wl'), c.id, date, kg, (b.note || '').trim() || null, t).run();
    return json({ ok: true });
  }
  return bad('Unknown log kind.');
};
