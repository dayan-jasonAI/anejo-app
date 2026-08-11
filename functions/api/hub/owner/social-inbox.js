// Owner social inbox — review, edit, and SEND Aña's Instagram drafts. Owner only.
//   GET  /api/hub/owner/social-inbox
//        → instagram threads (DM + comment), each with its pending drafts, escalation notes,
//          the last inbound text, and — for DMs — the live reply-window state (hours_left),
//          because "you have 3 hours left to answer this" is the difference between a reply
//          and an apology.
//   POST /api/hub/owner/social-inbox
//        { op:'send',    thread_id, message_id }        → deliver the draft via Instagram
//        { op:'edit',    thread_id, message_id, body }  → rewrite the draft before sending
//        { op:'dismiss', thread_id, message_id }        → reject it (marker, so it isn't re-drafted)
//
// THIS IS THE ONLY FILE THAT SENDS. The tick drafts, this endpoint delivers — and only behind an
// owner session, on an explicit op, one message at a time. There is no "send all".
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now } from '../../../_lib/hub.js';
import { replyWindow, sendDirectMessage, replyToComment } from '../../../_lib/instagram_messaging.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;

  const { results } = await env.DB.prepare(
    `SELECT t.*,
            (SELECT m.body FROM messages m WHERE m.thread_id = t.id AND m.direction='inbound'
              ORDER BY m.created_at DESC LIMIT 1) AS last_inbound_body
       FROM threads t
      WHERE t.audience = 'instagram'
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
      LIMIT 100`
  ).all();
  const threads = results || [];

  // Pending drafts + escalation notes for the whole inbox in one query each, grouped in JS —
  // 100 threads must not mean 200 queries.
  const draftMap = {};
  try {
    const r = await env.DB.prepare(
      `SELECT m.* FROM messages m JOIN threads t ON t.id = m.thread_id
        WHERE t.audience='instagram' AND m.sender_role='ana_draft'
          AND m.sent_at IS NULL AND m.dismissed_at IS NULL
        ORDER BY m.created_at ASC`
    ).all();
    for (const m of (r && r.results) || []) (draftMap[m.thread_id] = draftMap[m.thread_id] || []).push(m);
  } catch { /* pre-0067 DB: no drafts yet, the inbox still lists threads */ }
  const escMap = {};
  try {
    const r = await env.DB.prepare(
      `SELECT m.* FROM messages m JOIN threads t ON t.id = m.thread_id
        WHERE t.audience='instagram' AND m.sender_role='ana_escalation'
        ORDER BY m.created_at DESC LIMIT 50`
    ).all();
    for (const m of (r && r.results) || []) (escMap[m.thread_id] = escMap[m.thread_id] || []).push(m);
  } catch { /* same degradation */ }

  let pending = 0;
  const items = threads.map((t) => {
    const kind = (t.ref_type === 'ig_media') ? 'comment' : 'dm';
    const drafts = (draftMap[t.id] || []).map((m) => ({
      id: m.id, body: m.body || '', ref_id: m.ref_id || null, created_at: m.created_at,
    }));
    pending += drafts.length;
    return {
      id: t.id,
      kind,
      subject: t.subject,
      username: t.external_username || null,
      status: t.status,
      last_message_at: t.last_message_at || t.created_at,
      last_inbound: t.last_inbound_body || '',
      // Comments are public and never expire; only DMs carry Meta's 24-hour clock.
      window: kind === 'dm' ? replyWindow(t) : null,
      drafts,
      escalations: (escMap[t.id] || []).map((m) => ({ id: m.id, body: m.body || '', created_at: m.created_at })),
    };
  });

  return json({ ok: true, items, pending });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';
  const threadId = ((b && b.thread_id) || '').toString().trim();
  const messageId = ((b && b.message_id) || '').toString().trim();
  if (!threadId || !messageId) return bad('Missing thread_id or message_id.');

  // Both ids are required and must agree — an id pasted from the wrong thread must not act on a
  // draft it happens to match.
  const m = await env.DB.prepare('SELECT * FROM messages WHERE id=? AND thread_id=?').bind(messageId, threadId).first();
  if (!m) return bad('Draft not found.', 404);
  // Only rows the tick marked as Aña's drafts are actionable — escalation notes, inbound
  // messages, and human-sent rows all refuse here, whatever the op.
  if (m.sender_role !== 'ana_draft' || !m.ai_drafted) return bad('Not an Aña draft.', 400);
  if (m.sent_at) return bad('This draft was already sent.', 409);
  if (m.dismissed_at) return bad('This draft was dismissed.', 409);

  const t = now();

  if (op === 'edit') {
    const body = ((b && b.body) || '').toString().trim().slice(0, 1000);
    if (!body) return bad('Missing body.');
    // ai_drafted stays 1 through an edit: the honest record is "Aña drafted it, the owner
    // shaped it", not "a human wrote this from scratch".
    await env.DB.prepare('UPDATE messages SET body=? WHERE id=?').bind(body, m.id).run();
    return json({ ok: true, message: { id: m.id, body } });
  }

  if (op === 'dismiss') {
    await env.DB.prepare('UPDATE messages SET dismissed_at=? WHERE id=?').bind(t, m.id).run();
    return json({ ok: true, dismissed: true });
  }

  if (op === 'send') {
    const thread = await env.DB.prepare('SELECT * FROM threads WHERE id=?').bind(threadId).first();
    if (!thread) return bad('Thread not found.', 404);

    // ref_id decides the channel: a comment draft carries the comment id it answers; a DM draft
    // carries none and goes to the thread's IGSID. sendDirectMessage re-checks the 24-hour
    // window itself — approval here does not override Meta's clock.
    let r;
    if (m.ref_id) {
      r = await replyToComment(env, { commentId: m.ref_id, text: m.body });
    } else {
      r = await sendDirectMessage(env, { thread, recipientId: thread.external_id, text: m.body });
    }
    if (!r.ok) {
      return json({ ok: false, blocked: r.blocked || r.reason || null, error: r.error || 'Instagram refused the send.' }, 502);
    }

    await env.DB.prepare('UPDATE messages SET sent_at=? WHERE id=?').bind(t, m.id).run();
    await env.DB.prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?').bind(t, t, threadId).run();
    await capture(env, {
      event: 'message.sent',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { channel: 'instagram', audience: 'instagram', ai_drafted: true, thread_id: threadId, kind: m.ref_id ? 'comment' : 'dm' },
    });
    return json({ ok: true, sent: true, message: { id: m.id, sent_at: t } });
  }

  return bad('Unknown op.');
};
