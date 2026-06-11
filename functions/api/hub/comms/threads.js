// Comms core — threads.
//   GET  /api/hub/comms/threads[?status=open|closed|all]
//        → threads visible to the session, newest activity first, each with an 80-char
//          Default status=open so closed/archived threads drop out of the inbox; each
//          item carries status + closed_at.
//          preview of the last message, a counterparty display name, and unread_count
//          (messages newer than the session's thread_reads watermark, excluding own).
//          Envelope also carries total_unread. thread_reads ships in migration 0007 —
//          until it exists every unread_count degrades to 0.
//          Owner responses also include { recipients } (active staff + vendors) for compose.
//   POST /api/hub/comms/threads { audience?, staff_id?, subject?, body, channel?, ai_drafted?, ref_type?, ref_id? }
//        → find-or-create a thread and insert its first message.
//          Owner: may target any active staff/vendor (staff_id) or audience 'broadcast'.
//          Staff/vendor (non-owner): always routed to the first active owner.
//          Trainer/client: a thread bound to their own trainer_id/client_id.
// Fires thread.created (on create) + message.sent. SMS/WhatsApp delivery is no-op safe.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now, bit } from '../../../_lib/hub.js';
import { sendSms, sendWhatsApp } from '../../../_lib/twilio.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];
const CHANNELS = ['in_app', 'sms', 'whatsapp'];

// Who this thread "is with", from the viewer's perspective.
function counterpartyName(t, ctx) {
  if (t.audience === 'broadcast') return 'Broadcast';
  if (t.client_name) return t.client_name;
  if (t.trainer_name) return t.trainer_name;
  if (t.staff_id && t.staff_id !== ctx.distinct_id) return t.staff_name || 'Staff';
  if (t.created_by && t.created_by !== ctx.distinct_id) return t.creator_name || 'Staff';
  return t.staff_name || t.creator_name || 'Conversation';
}

// Visibility WHERE clause for the session (same rules enforced in messages.js).
function scopeWhere(ctx) {
  if (ctx.role === 'owner') return { where: '1=1', binds: [] };
  if (ctx.role === 'trainer') return { where: 't.trainer_id = ?', binds: [ctx.distinct_id] };
  if (ctx.role === 'client') return { where: 't.client_id = ?', binds: [ctx.distinct_id] };
  return {
    where: "(t.staff_id = ? OR t.created_by = ? OR t.audience = 'broadcast')",
    binds: [ctx.distinct_id, ctx.distinct_id],
  };
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  const { where, binds } = scopeWhere(ctx);

  // Lifecycle filter: open (default — closed threads drop out of the inbox),
  // closed, or all. Anything unrecognized falls back to 'open'.
  const statusParam = (new URL(request.url).searchParams.get('status') || 'open').toLowerCase();
  let statusFilter = '';
  if (statusParam === 'open') statusFilter = " AND t.status = 'open'";
  else if (statusParam === 'closed') statusFilter = " AND t.status = 'closed'";
  // 'all' (or unknown → treated as 'open' below) — keep default
  if (statusParam !== 'open' && statusParam !== 'closed' && statusParam !== 'all') {
    statusFilter = " AND t.status = 'open'";
  }

  const { results } = await env.DB.prepare(
    `SELECT t.*,
            s1.name AS staff_name, s1.role AS staff_role,
            s2.name AS creator_name, s2.role AS creator_role,
            tr.name AS trainer_name, c.name AS client_name,
            SUBSTR((SELECT m.body FROM messages m WHERE m.thread_id = t.id
                     ORDER BY m.created_at DESC LIMIT 1), 1, 80) AS preview
       FROM threads t
       LEFT JOIN staff s1 ON s1.id = t.staff_id
       LEFT JOIN staff s2 ON s2.id = t.created_by
       LEFT JOIN trainers tr ON tr.id = t.trainer_id
       LEFT JOIN clients c ON c.id = t.client_id
      WHERE ${where}${statusFilter}
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
      LIMIT 100`
  ).bind(...binds).all();

  // Per-thread unread counts in ONE grouped query: messages newer than this
  // reader's thread_reads watermark (0 when never read), excluding their own.
  // thread_reads ships in migration 0007 — until the table exists, degrade to 0.
  const readerId = ctx.distinct_id || ctx.email || '';
  let unreadMap = {};
  try {
    const ur = await env.DB.prepare(
      `SELECT m.thread_id AS tid, COUNT(*) AS n
         FROM messages m
         JOIN threads t ON t.id = m.thread_id
         LEFT JOIN thread_reads r ON r.thread_id = m.thread_id AND r.reader_id = ?
        WHERE ${where}
          AND m.created_at > COALESCE(r.last_read_at, 0)
          AND COALESCE(m.sender_id, '') != ?
        GROUP BY m.thread_id`
    ).bind(readerId, ...binds, readerId).all();
    for (const row of (ur.results || [])) unreadMap[row.tid] = Number(row.n) || 0;
  } catch { unreadMap = {}; /* thread_reads not migrated yet */ }
  let totalUnread = 0;
  for (const k in unreadMap) totalUnread += unreadMap[k];

  const items = (results || []).map((t) => ({
    id: t.id,
    audience: t.audience,
    subject: t.subject,
    status: t.status,
    staff_id: t.staff_id || null,
    created_by: t.created_by || null,
    closed_at: t.closed_at || null,
    ref_type: t.ref_type || null,
    ref_id: t.ref_id || null,
    counterparty_name: counterpartyName(t, ctx),
    preview: t.preview || '',
    unread_count: unreadMap[t.id] || 0,
    last_message_at: t.last_message_at || t.created_at,
    created_at: t.created_at,
  }));

  // Owner compose: every active staff + vendor (vendors are staff rows with role=vendor).
  let recipients;
  if (ctx.role === 'owner') {
    const r = await env.DB.prepare(
      `SELECT id, name, role, team,
              CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END AS has_phone
         FROM staff
        WHERE active = 1 AND role != 'owner'
        ORDER BY role, name`
    ).all();
    recipients = r.results || [];
  }

  return json({ ok: true, items, total_unread: totalUnread, ...(recipients ? { recipients } : {}) });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const body = ((b && b.body) || '').toString().trim().slice(0, 4000);
  if (!body) return bad('Missing message body.');
  const channel = CHANNELS.includes(b && b.channel) ? b.channel : 'in_app';
  const subject = ((b && b.subject) || '').toString().trim().slice(0, 140) || null;
  const aiDrafted = bit(b && b.ai_drafted);
  const ts = now();

  // ----- resolve the thread target by role -----
  let audience = null;
  let staffId = null;
  let trainerId = null;
  let clientId = null;
  let counterparty = null; // staff row we may SMS/WhatsApp

  if (ctx.role === 'trainer') {
    trainerId = ctx.distinct_id;
    audience = 'trainer';
  } else if (ctx.role === 'client') {
    clientId = ctx.distinct_id;
    audience = 'client';
  } else if (ctx.role === 'owner') {
    if ((b && b.audience) === 'broadcast') {
      audience = 'broadcast';
    } else if (b && b.staff_id) {
      counterparty = await env.DB
        .prepare('SELECT id, name, role, team, phone FROM staff WHERE id = ? AND active = 1')
        .bind(String(b.staff_id)).first();
      if (!counterparty) return bad('Recipient not found.', 404);
      staffId = counterparty.id;
      audience = counterparty.role;
    } else {
      return bad('Pick a recipient or broadcast.');
    }
  } else {
    // kitchen/driver/vendor — may only open threads to the owner (front office).
    counterparty = await env.DB
      .prepare("SELECT id, name, role, team, phone FROM staff WHERE role = 'owner' AND active = 1 ORDER BY created_at ASC LIMIT 1")
      .first();
    if (!counterparty) return bad('No owner account is configured.', 500);
    staffId = counterparty.id;
    audience = ctx.role;
  }

  // ----- find-or-create the thread -----
  let thread = null;
  if (staffId) {
    // Owner reuses the latest open thread with that counterparty; non-owners reuse
    // only their own thread to the owner (each staff member gets their own).
    const reuseWhere = ctx.role === 'owner'
      ? "staff_id = ? AND status = 'open'"
      : "staff_id = ? AND created_by = ? AND status = 'open'";
    const reuseBinds = ctx.role === 'owner' ? [staffId] : [staffId, ctx.distinct_id];
    thread = await env.DB.prepare(
      `SELECT * FROM threads WHERE ${reuseWhere} ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1`
    ).bind(...reuseBinds).first();
  } else if (trainerId) {
    thread = await env.DB.prepare(
      "SELECT * FROM threads WHERE trainer_id = ? AND status = 'open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1"
    ).bind(trainerId).first();
  } else if (clientId) {
    thread = await env.DB.prepare(
      "SELECT * FROM threads WHERE client_id = ? AND status = 'open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1"
    ).bind(clientId).first();
  } else if (audience === 'broadcast') {
    thread = await env.DB.prepare(
      "SELECT * FROM threads WHERE audience = 'broadcast' AND status = 'open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1"
    ).first();
  }

  let created = false;
  if (!thread) {
    const tid = id('thr');
    await env.DB.prepare(
      `INSERT INTO threads (id, audience, subject, created_by, client_id, trainer_id, staff_id,
                            ref_type, ref_id, last_message_at, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?)`
    ).bind(
      tid, audience, subject, ctx.distinct_id || null, clientId, trainerId, staffId,
      ((b && b.ref_type) || null), ((b && b.ref_id) || null), ts, ts, ts
    ).run();
    thread = {
      id: tid, audience, subject, created_by: ctx.distinct_id || null,
      client_id: clientId, trainer_id: trainerId, staff_id: staffId,
      status: 'open', last_message_at: ts, created_at: ts,
    };
    created = true;
    await capture(env, {
      event: 'thread.created',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { thread_id: tid, audience, channel },
    });
  }

  // ----- first message (+ optional SMS/WhatsApp bridge, no-op safe) -----
  let sms = null;
  let smsLogId = null;
  if ((channel === 'sms' || channel === 'whatsapp') && counterparty && counterparty.phone) {
    const sender = channel === 'whatsapp' ? sendWhatsApp : sendSms;
    sms = await sender(env, { to: counterparty.phone, body, thread_id: thread.id });
    smsLogId = (sms && sms.sms_log_id) || null;
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

  return json({
    ok: true,
    created,
    thread: { id: thread.id, audience: thread.audience, subject: thread.subject, staff_id: thread.staff_id || null },
    message: { id: mid, thread_id: thread.id, channel, body, created_at: ts },
    sms: sms ? { sent: !!sms.sent, noop: !!sms.noop } : null,
  });
};
