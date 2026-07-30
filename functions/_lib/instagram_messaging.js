// Replying to Instagram comments and DMs. Files under _lib are NOT routed.
//
// THREE RULES THAT ARE NOT OURS TO BEND. Breaking any of them is a policy violation against the
// account itself — not a failed request, a risk to the business's own Instagram presence:
//
//   1. NEVER MESSAGE FIRST. Meta: "Only after an Instagram user has sent your app user's
//      Instagram professional account a message can your app send a message to the Instagram
//      user." There is no follower list and no new-follower event, so "welcome every new
//      follower" has no legitimate implementation. This module has no way to express it: every
//      send takes a thread that already has an inbound message on it.
//
//   2. 24 HOURS. A reply is allowed within 24 hours of THEIR last message. Past that it needs the
//      human_agent tag, which means what it says — a person wrote it. We do not tag automated
//      copy as human.
//
//   3. NO AUTO-FOLLOW, NO AUTO-LIKE, NO SCRAPING. Not offered here, deliberately. The tools that
//      do it drive the account with harvested sessions and put it at risk of being banned.
import { igConfigured, resolveTarget } from './instagram.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Is a reply to this thread still allowed? Returns { ok } or { ok:false, reason }. */
export function replyWindow(thread, nowMs = Date.now()) {
  const last = Number((thread && thread.last_inbound_at) || 0);
  // No inbound message at all means we would be initiating, which is never allowed.
  if (!last) return { ok: false, reason: 'never_messaged_us', hours_left: 0 };
  const elapsed = nowMs - last;
  if (elapsed > WINDOW_MS) {
    return { ok: false, reason: 'window_closed', hours_ago: Math.round(elapsed / 3600000) };
  }
  return { ok: true, hours_left: Math.max(0, Math.round((WINDOW_MS - elapsed) / 3600000)) };
}

async function graphPost(env, path, body) {
  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const url = `${target.base}${path}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: env.IG_ACCESS_TOKEN }),
    });
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { /* Meta returns HTML on some failures */ }
    if (!r.ok || (j && j.error)) {
      const e = (j && j.error) || {};
      return { ok: false, error: [e.message, e.error_user_msg].filter(Boolean).join(' — ') || text.slice(0, 200), code: e.code || r.status };
    }
    return { ok: true, body: j };
  } catch (e) {
    return { ok: false, error: 'Could not reach Instagram. ' + String((e && e.message) || '').slice(0, 120) };
  }
}

/**
 * Send a DM. `thread` must be a row that already carries last_inbound_at — the window check is
 * done HERE rather than by the caller, so there is no path to a send that skipped it.
 */
export async function sendDirectMessage(env, { thread, recipientId, text } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!recipientId) return { ok: false, error: 'No recipient.' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'Nothing to send.' };

  const win = replyWindow(thread);
  if (!win.ok) {
    return {
      ok: false,
      blocked: win.reason,
      error: win.reason === 'never_messaged_us'
        ? 'Instagram does not allow messaging someone who has not messaged you first.'
        : `Instagram's 24-hour reply window closed (they wrote ${win.hours_ago}h ago). Reply on the app instead.`,
    };
  }

  return graphPost(env, '/me/messages', {
    recipient: { id: recipientId },
    message: { text: body.slice(0, 1000) },
  });
}

/** Reply publicly under a comment. Comments have no 24-hour window — the reply is public. */
export async function replyToComment(env, { commentId, text } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!commentId) return { ok: false, error: 'No comment.' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'Nothing to send.' };
  return graphPost(env, `/${commentId}/replies`, { message: body.slice(0, 1000) });
}

/**
 * Hide a comment rather than delete it. Hiding is reversible and invisible to the author;
 * deleting is neither, and deleting a real customer's complaint is how a small thing becomes a
 * screenshot. Reserved for spam, and never automatic.
 */
export async function hideComment(env, { commentId, hide = true } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!commentId) return { ok: false, error: 'No comment.' };
  return graphPost(env, `/${commentId}`, { hide: !!hide });
}
