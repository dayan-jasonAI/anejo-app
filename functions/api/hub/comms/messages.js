// Comms core — messages within a thread.
//   GET  /api/hub/comms/messages?thread_id=thr_x
//        → messages ASC (oldest first) with a `mine` flag, plus thread header info.
//          Side effect: upserts thread_reads (thread_id, reader, now) so the thread's
//          unread badge clears; safe no-op if migration 0007 hasn't run yet.
//   POST /api/hub/comms/messages { thread_id, body, channel:'in_app'|'sms'|'whatsapp', ai_drafted? }
//        → insert an outbound message, bump thread.last_message_at; if channel is
//          sms/whatsapp and the thread's staff counterparty has a phone, bridge via
//          Twilio (no-op safe without creds) and link the sms_log row to the message.
// Access rules mirror threads.js: owner sees all; staff/vendor see threads where they
// are the counterparty, the creator, or audience='broadcast'; trainer/client see their own.
// Fires message.sent {channel, audience, ai_drafted}.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now, bit } from '../../../_lib/hub.js';
import { sendSms, sendWhatsApp } from '../../../_lib/twilio.js';
import { sendPushTickle } from '../../../_lib/push.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];
const CHANNELS = ['in_app', 'sms', 'whatsapp'];

// Same visibility rules as threads.js, applied to one loaded thread row.
function canAccessThread(ctx, t) {
  if (!ctx || !t) return false;
  if (ctx.role === 'owner') return true;
  if (ctx.role === 'trainer') return !!t.trainer_id && t.trainer_id === ctx.distinct_id;
  if (ctx.role === 'client') return !!t.client_id && t.client_id === ctx.distinct_id;
  return (
    (!!t.staff_id && t.staff_id === ctx.distinct_id) ||
    (!!t.created_by && t.created_by === ctx.distinct_id) ||
    t.audience === 'broadcast'
  );
}

// The staff row "on the other side" of the thread from the current session (or null).
async function counterpartyStaff(env, ctx, t) {
  let targetId = null;
  if (t.staff_id && t.staff_id !== ctx.distinct_id) targetId = t.staff_id;
  else if (t.created_by && t.created_by !== ctx.distinct_id) targetId = t.created_by;
  if (!targetId) return null;
  return env.DB.prepare('SELECT id, name, role, team, phone FROM staff WHERE id = ?').bind(targetId).first();
}

// Display name for the thread header (mirror of threads.js counterpartyName).
async function headerName(env, ctx, t) {
  if (t.audience === 'broadcast') return 'Broadcast';
  if (t.client_id) {
    const c = await env.DB.prepare('SELECT name FROM clients WHERE id = ?').bind(t.client_id).first();
    if (c && c.name) return c.name;
  }
  if (t.trainer_id) {
    const tr = await env.DB.prepare('SELECT name FROM trainers WHERE id = ?').bind(t.trainer_id).first();
    if (tr && tr.name) return tr.name;
  }
  const cp = await counterpartyStaff(env, ctx, t);
  if (cp && cp.name) return cp.name;
  return t.subject || 'Conversation';
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const threadId = (url.searchParams.get('thread_id') || '').trim();
  if (!threadId) return bad('Missing thread_id.');

  const thread = await env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(threadId).first();
  if (!thread) return bad('Thread not found.', 404);
  if (!canAccessThread(ctx, thread)) return bad('Forbidden for this thread.', 403);

  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 500'
  ).bind(threadId).all();

  // Mark the thread read for this session (powers unread badges in threads.js /
  // unread.js). thread_reads ships in migration 0007 and may not exist yet at
  // runtime — degrade silently when it doesn't.
  const readerId = ctx.distinct_id || ctx.email;
  if (readerId) {
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO thread_reads (thread_id, reader_id, last_read_at) VALUES (?,?,?)'
      ).bind(threadId, readerId, now()).run();
    } catch { /* thread_reads not migrated yet — unread counts simply stay 0 */ }
  }

  const items = (results || []).map((m) => ({
    id: m.id,
    direction: m.direction,
    channel: m.channel,
    sender_id: m.sender_id || null,
    sender_role: m.sender_role || null,
    body: m.body || '',
    ai_drafted: !!m.ai_drafted,
    created_at: m.created_at,
    mine: !!(m.sender_id && ctx.distinct_id && m.sender_id === ctx.distinct_id),
  }));

  const cp = await counterpartyStaff(env, ctx, thread);
  return json({
    ok: true,
    thread: {
      id: thread.id,
      audience: thread.audience,
      subject: thread.subject,
      status: thread.status,
      ref_type: thread.ref_type || null,
      ref_id: thread.ref_id || null,
      counterparty_name: await headerName(env, ctx, thread),
      can_sms: !!(cp && cp.phone),
    },
    items,
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const threadId = ((b && b.thread_id) || '').toString().trim();
  const body = ((b && b.body) || '').toString().trim().slice(0, 4000);
  if (!threadId) return bad('Missing thread_id.');
  if (!body) return bad('Missing message body.');
  const channel = (b && b.channel) || 'in_app';
  if (!CHANNELS.includes(channel)) return bad('Unknown channel.');
  const aiDrafted = bit(b && b.ai_drafted);

  const thread = await env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(threadId).first();
  if (!thread) return bad('Thread not found.', 404);
  if (!canAccessThread(ctx, thread)) return bad('Forbidden for this thread.', 403);

  const ts = now();

  // SMS/WhatsApp bridge when the counterparty staff row has a phone (no-op without creds).
  let sms = null;
  let smsLogId = null;
  if (channel === 'sms' || channel === 'whatsapp') {
    const cp = await counterpartyStaff(env, ctx, thread);
    if (cp && cp.phone) {
      const sender = channel === 'whatsapp' ? sendWhatsApp : sendSms;
      sms = await sender(env, { to: cp.phone, body, thread_id: thread.id });
      smsLogId = (sms && sms.sms_log_id) || null;
    }
  }

  const mid = id('msg');
  await env.DB.prepare(
    `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, sms_log_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(mid, thread.id, 'outbound', channel, ctx.distinct_id || null, ctx.role, body, aiDrafted, smsLogId, ts).run();
  await env.DB.prepare('UPDATE threads SET last_message_at = ?, updated_at = ? WHERE id = ?')
    .bind(ts, ts, thread.id).run();

  await capture(env, {
    event: 'message.sent',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { channel, audience: thread.audience, ai_drafted: !!aiDrafted, thread_id: thread.id },
  });

  // Tickle the receiving side with a payload-less web push (the SW peeks for
  // context). If the thread has a staff counterparty and the sender isn't them,
  // wake that staffer's devices; when the sender IS the counterparty (staff,
  // trainer or client replying), wake the owner. No-op safe without VAPID.
  try {
    if (thread.staff_id && thread.staff_id !== ctx.distinct_id) {
      await sendPushTickle(env, { staffIds: [thread.staff_id] });
    } else if (ctx.role !== 'owner') {
      await sendPushTickle(env, { roles: ['owner'] });
    }
  } catch { /* push must never break messaging */ }

  return json({
    ok: true,
    message: { id: mid, thread_id: thread.id, channel, body, created_at: ts, mine: true },
    sms: sms ? { sent: !!sms.sent, noop: !!sms.noop } : null,
  });
};
