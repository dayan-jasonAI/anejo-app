// POST /api/hub/owner/social-drill — run Aña's REAL brain against a battery of inputs, sending
// NOTHING. The training rig behind the 2026-07-31 re-certification: real model, real menu, real
// prompts, real guards — and structurally no way to reach Instagram, because this file never
// imports the sending module (pinned by test, same guarantee the tick had in draft-only days).
//
// Budget note: every non-reaction case is a real metered Haiku call. That is the point — a drill
// against a mock brain certifies the mock.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { draftReply, reactionReplyFor, looksLikeScaffolding } from '../../../_lib/ana_social.js';

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON.'); }
  const cases = Array.isArray(b && b.cases) ? b.cases.slice(0, 30) : [];
  if (!cases.length) return bad('Send cases: [{kind, text, username}].');

  const out = [];
  for (const c of cases) {
    const kind = c.kind === 'dm' ? 'dm' : 'comment';
    const text = String(c.text || '');
    // The exact pipeline the tick runs, minus the send: reaction bypass first, then the model,
    // then the guard verdict the auto-send gate would apply.
    const reaction = kind === 'comment' ? reactionReplyFor(text, String(c.username || 'seed')) : null;
    if (reaction) { out.push({ kind, text, mode: 'reaction', reply: reaction, would_send: true }); continue; }
    const d = await draftReply(env, { kind, text, username: c.username, auto: true });
    if (!d.ok) { out.push({ kind, text, mode: 'error', reason: d.reason || 'failed', would_send: false }); continue; }
    if (d.escalate) { out.push({ kind, text, mode: 'ESCALATE', reason: d.reason, would_send: false }); continue; }
    const guarded = looksLikeScaffolding(d.draft);
    out.push({ kind, text, mode: d.special ? 'SPECIAL' : 'reply', reply: d.draft, guard_blocked: guarded, would_send: !guarded });
  }
  return json({ ok: true, results: out });
};
