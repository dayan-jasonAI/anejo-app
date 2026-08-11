// Instagram "Ice Breakers" — the tappable starter buttons shown when someone OPENS Añejo's DMs,
// before they've written anything. This is the ONE compliant analog to the "auto-DM on follow"
// look: it does not message first (Meta shows it only when the user opens the chat), so it breaks
// none of the rules in instagram_messaging.js. A tap sends a `postback` webhook, which we route
// into Aña's normal inbound reply flow (see webhooks/instagram.js). Files under _lib are NOT routed.
import { igConfigured, resolveTarget } from './instagram.js';

// Four buttons max (Meta limit). Payloads map to an intent phrase Aña already knows how to answer,
// so a tap is handled by the exact same brain as a typed message — no separate script to maintain.
export const ICE_BREAKERS = [
  { question: '🍽️ Order fresh bowls', payload: 'IB_ORDER' },
  { question: '🌿 Weekly meal plans', payload: 'IB_SUBSCRIBE' },
  { question: '🤝 Partner / creator program', payload: 'IB_AFFILIATE' },
  { question: '📍 Do you deliver to me?', payload: 'IB_DELIVERY' },
];

// Ice-breaker tap → the message text Aña receives (routes through her existing intent handling).
export const IB_PAYLOAD_TEXT = {
  IB_ORDER: 'I want to order fresh bowls',
  IB_SUBSCRIBE: 'Tell me about the weekly meal plans',
  IB_AFFILIATE: "I'm a creator/influencer and want to partner with Añejo",
  IB_DELIVERY: 'Do you deliver to my area?',
};

export function iceBreakerText(payload) {
  return IB_PAYLOAD_TEXT[payload] || null;
}

// Publish the ice breakers to the connected IG professional account. Gated + graceful: no token → no-op.
export async function publishIceBreakers(env) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const target = await resolveTarget(env);
  if (!target.ok) return target;
  try {
    const r = await fetch(`${target.base}/me/messenger_profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'instagram',
        ice_breakers: [{ call_to_actions: ICE_BREAKERS.map((b) => ({ question: b.question, payload: b.payload })), locale: 'default' }],
        access_token: env.IG_ACCESS_TOKEN,
      }),
    });
    const text = await r.text();
    let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* Meta returns HTML on some errors */ }
    if (!r.ok || (j && j.error)) {
      const e = (j && j.error) || {};
      return { ok: false, error: [e.message, e.error_user_msg].filter(Boolean).join(' — ') || text.slice(0, 200), code: e.code || r.status };
    }
    return { ok: true, ice_breakers: ICE_BREAKERS };
  } catch (e) {
    return { ok: false, error: 'Could not reach Instagram. ' + String((e && e.message) || '').slice(0, 120) };
  }
}
