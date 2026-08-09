// POST /api/chat — Añejo website customer-service assistant (Claude-powered).
// Grounded, bilingual Q&A + guidance for menu, delivery, subscriptions, and complaints.
// Uses ANTHROPIC_API_KEY (already configured). Stateless: the client sends the running
// message history each turn. Rate-limited as a cost-abuse guard.
//
// The system prompt lives in _lib/ana_social.js and is SHARED with the Instagram draft engine —
// one Aña, one set of prices and rules, so the website chat and a drafted DM can never disagree
// about what a bowl costs.
import { json, bad, id, now, isEmail } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { budgetGate, recordSpend } from '../_lib/ai_budget.js';
import { loadMenu } from '../_lib/menu.js';
import { anaSystemPrompt, detectCommercialIntent } from '../_lib/ana_social.js';
import { insertLead } from '../_lib/leads.js';

const MODEL = 'claude-sonnet-4-6';

// Best-fit onto the existing leads.kind enum, mirroring _lib/social_leads.js so a web-chat lead
// lands in the SAME owner filter chips as an Instagram one instead of inventing a taxonomy.
const CHAT_KIND_BY_INTENT = {
  catering: 'tasting',
  bulk_corporate: 'tasting',
  wholesale_partnership: 'wholesale',
  subscription: 'tasting',
};

// Pull the first email out of what the visitor typed — the only thing that makes a web-chat lead
// actionable (unlike Instagram, this channel carries no stable identity). Without contact info
// there is nothing to follow up with, so we never even write a row. Phone is captured if present.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

// Turn commercial intent + shared contact info in the website chat into a lead the owner sees.
// Reuses _lib/leads.js insertLead (the one lead-write path) and _lib/ana_social.js
// detectCommercialIntent — the same pieces _lib/social_leads.js uses for Instagram. It SENDS
// NOTHING and never throws into the request: the reply must land whether or not this succeeds.
async function captureChatLead(env, userText) {
  try {
    if (!env || !env.DB) return;
    const text = String(userText || '');
    const em = text.match(EMAIL_RE);
    if (!em) return;                                  // no contact = nothing actionable to store
    const email = em[0].trim().slice(0, 160);
    if (!isEmail(email)) return;
    const hit = detectCommercialIntent(text);         // classification only; capture is gated on the email
    const ph = text.match(PHONE_RE);
    const phone = ph ? ph[0].trim().slice(0, 40) : null;

    // Dedupe: one web-chat lead per email, same select-first posture as the other capture paths.
    const existing = await env.DB
      .prepare("SELECT id FROM leads WHERE channel='web' AND lower(email)=lower(?) AND src='chat' LIMIT 1")
      .bind(email)
      .first();
    if (existing) return;

    await insertLead(env, {
      id: id('ld'),
      kind: (hit && CHAT_KIND_BY_INTENT[hit.intent]) || 'tasting',
      email,
      phone,
      interest: 'Website chat',
      message: text.slice(0, 2000),
      channel: 'web',
      src: 'chat',
      ig_intent: hit ? hit.intent : null,             // reuse the classifier's label column; not IG-specific in meaning
      ig_confidence: hit ? hit.confidence : null,
      trigger_message: text.slice(0, 2000),
      created_at: now(),
    });
    // NOTHING is sent — capturing intent is not contacting anyone.
  } catch { /* additive, best-effort — never disturb the chat reply */ }
}

export const onRequestPost = async ({ request, env, waitUntil }) => {
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

  // OPT-IN-BY-ACTION lead capture: if the visitor's latest message shares an email (contact info),
  // record it as a lead — best-effort, off the reply's critical path. Deferred via waitUntil so it
  // never adds latency; falls back to an un-awaited call where waitUntil is unavailable. Sends
  // nothing (see captureChatLead).
  const lastUserText = msgs[msgs.length - 1].content;
  const capturePromise = captureChatLead(env, lastUserText);
  if (typeof waitUntil === 'function') waitUntil(capturePromise); else capturePromise.catch(() => {});

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
