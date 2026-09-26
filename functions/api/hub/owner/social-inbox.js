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
// Manual sends and configured automatic sends share durable claims. This endpoint still
// requires the existing marketing-desk role and an explicit operation; there is no send-all.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { sendAnaDraft, reconcileInstagramReplyAttempt } from '../../../_lib/instagram_reply_attempt.js';
import { now } from '../../../_lib/hub.js';
import { replyWindow } from '../../../_lib/instagram_messaging.js';

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
  let draftsReadStatus="available",escalationsReadStatus="available";
  try {
    const r = await env.DB.prepare(
      `SELECT m.* FROM messages m JOIN threads t ON t.id = m.thread_id
        WHERE t.audience='instagram' AND m.sender_role='ana_draft'
          AND m.sent_at IS NULL AND m.dismissed_at IS NULL
        ORDER BY m.created_at ASC`
    ).all();
    if(r?.success===false||!Array.isArray(r?.results))throw Error("unavailable");
    for (const m of r.results) (draftMap[m.thread_id] = draftMap[m.thread_id] || []).push(m);
  } catch { draftsReadStatus="unavailable"; }
  const escMap = {};
  try {
    const r = await env.DB.prepare(
      `SELECT m.* FROM messages m JOIN threads t ON t.id = m.thread_id
        WHERE t.audience='instagram' AND m.sender_role='ana_escalation'
        ORDER BY m.created_at DESC LIMIT 50`
    ).all();
    if(r?.success===false||!Array.isArray(r?.results))throw Error("unavailable");
    for (const m of r.results) (escMap[m.thread_id] = escMap[m.thread_id] || []).push(m);
  } catch { escalationsReadStatus="unavailable"; }

  const attemptMap={};let attemptHistory='available';
  try {
    const read=await env.DB.prepare('SELECT id,message_id,thread_id,kind,trigger_id,state,provider_message_id,error_code,created_at,completed_at,(acceptance_receipt_json IS NOT NULL) AS has_acceptance_receipt FROM instagram_reply_attempts ORDER BY created_at DESC LIMIT 200').all();
    if(read?.success===false||!Array.isArray(read?.results))throw Error('unavailable');
    for(const attempt of read.results)(attemptMap[attempt.thread_id]=attemptMap[attempt.thread_id]||[]).push({...attempt,has_acceptance_receipt:Number(attempt.has_acceptance_receipt)===1});
  } catch {attemptHistory='unavailable';}
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
      reply_attempts:attemptHistory==='available'?(attemptMap[t.id]||[]):null,
      escalations: (escMap[t.id] || []).map((m) => ({ id: m.id, body: m.body || '', created_at: m.created_at })),
    };
  });

  return json({ ok: true, items, pending: draftsReadStatus==="available"?pending:null, drafts_read_status:draftsReadStatus, escalations_read_status:escalationsReadStatus, reply_attempt_history:attemptHistory, reply_attempt_scope:'latest_200_attempts' });
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
  if (op === 'reconcile') {
    if(typeof b.attempt_id!=='string'||!b.attempt_id||b.attempt_id.length>100)return bad('attempt_id is required.');
    const attempt=await env.DB.prepare('SELECT id FROM instagram_reply_attempts WHERE id=? AND thread_id=? AND message_id=?').bind(b.attempt_id,threadId,messageId).first();
    if(!attempt)return bad('Reply attempt not found.',404);
    const result=await reconcileInstagramReplyAttempt(env,{attemptId:attempt.id,threadId});
    return json({...result,reconciliation_only:true},result.sent?200:409);
  }
  if (op === 'send') {
    if(typeof b.expected_body!=='string')return bad('expected_body is required.');
    const r=await sendAnaDraft(env,{messageId:m.id,threadId,expectedBody:b.expected_body,initiatedBy:ctx.distinct_id||ctx.role});
    if(!r.ok)return json({...r,ok:false},r.state==='claimed'||r.state==='unknown'?409:502);
    if(!r.replayed)await capture(env,{event:'message.sent',distinct_id:ctx.distinct_id,role:ctx.role,team:ctx.team,properties:{channel:'instagram',audience:'instagram',ai_drafted:true,thread_id:threadId,kind:m.ref_id?'comment':'dm'}});
    return json({...r,message:{id:r.message_id,sent_at:r.sent_at}});
  }
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
    const changed=await env.DB.prepare("UPDATE messages SET body=? WHERE id=? AND body=? AND sent_at IS NULL AND dismissed_at IS NULL AND NOT EXISTS (SELECT 1 FROM instagram_reply_attempts WHERE message_id=messages.id)").bind(body,m.id,m.body).run();
    if(changed.meta?.changes!==1)return bad('Draft changed or a send was already claimed.',409);
    return json({ ok: true, message: { id: m.id, body } });
  }

  if (op === 'dismiss') {
    const changed=await env.DB.prepare("UPDATE messages SET dismissed_at=? WHERE id=? AND sent_at IS NULL AND dismissed_at IS NULL AND NOT EXISTS (SELECT 1 FROM instagram_reply_attempts WHERE message_id=messages.id)").bind(t,m.id).run();
    if(changed.meta?.changes!==1)return bad('Draft changed or a send was already claimed.',409);
    return json({ ok: true, dismissed: true });
  }



  return bad('Unknown op.');
};
