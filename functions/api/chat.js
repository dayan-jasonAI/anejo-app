// POST /api/chat — Añejo website customer-service assistant (Claude-powered).
// Grounded, bilingual Q&A + guidance for menu, delivery, subscriptions, and complaints.
// Uses ANTHROPIC_API_KEY (already configured). Stateless: the client sends the running
// message history each turn. Rate-limited as a cost-abuse guard.
//
// The system prompt lives in _lib/ana_social.js and is SHARED with the Instagram draft engine —
// one Aña, one set of prices and rules, so the website chat and a drafted DM can never disagree
// about what a bowl costs.
import { json, bad } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { budgetGate, recordSpend } from '../_lib/ai_budget.js';
import { loadMenu } from '../_lib/menu.js';
import { anaSystemPrompt } from '../_lib/ana_social.js';

const MODEL = 'claude-sonnet-4-6';

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'chat', limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Chat is not available right now.' }, 503);
  // The $50/week model-spend ceiling is HARD. Over it, Aña answers with the same graceful
  // copy as the no-key path — a customer must never see a budget error, just "not right now".
  if (!(await budgetGate(env)).ok) return json({ error: 'Chat is not available right now.' }, 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  let msgs = Array.isArray(b.messages) ? b.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return bad('No message to respond to.');

  // Prices are read per request. loadMenu never throws — it degrades to last-known-good — so the
  // assistant always has a menu to quote from, just possibly a slightly stale one.
  const menu = await loadMenu(env);

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: anaSystemPrompt(menu), messages: msgs }),
    });
  } catch {
    return json({ error: 'Could not reach the assistant. Please email dayan@anejocateringco.com.' }, 502);
  }
  if (!r.ok) return json({ error: 'The assistant is briefly unavailable. Please try again.' }, 502);

  const data = await r.json();
  await recordSpend(env, { feature: 'chat', model: MODEL, usage: data.usage });
  const reply = (data.content || []).map((c) => c.text || '').join('').trim();
  return json({ reply: reply || "Sorry, I didn't catch that — could you say it another way?" });
};
