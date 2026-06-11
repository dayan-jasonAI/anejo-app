// Comms — close / reopen a conversation thread (archive).
//   POST /api/hub/comms/thread-status { thread_id, action:'close'|'reopen' }
//        → owner-only mutation of the thread's lifecycle status.
//          close  → status='closed', closed_at=now(), updated_at=now()
//          reopen → status='open',  closed_at=NULL,   updated_at=now()
// Auth: any of the six HUB roles may reach the endpoint, but ONLY the owner
// (ctx.role==='owner') may close/reopen — everyone else gets a 403. No
// soft-delete is performed: the row is preserved, only flags change (owner
// directive: never delete data). No tracking event is fired — an author action
// like archiving a thread needs no analytics capture here.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];
const ACTIONS = ['close', 'reopen'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;
  if (ctx.role !== 'owner') return bad('Only the owner can close conversations.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const threadId = ((b && b.thread_id) || '').toString().trim();
  const action = ((b && b.action) || '').toString().trim();
  if (!threadId) return bad('Missing thread_id.');
  if (!ACTIONS.includes(action)) return bad('Unknown action.');

  const thread = await env.DB.prepare('SELECT id, status FROM threads WHERE id = ?').bind(threadId).first();
  if (!thread) return bad('Thread not found.', 404);

  const ts = now();
  let status;
  if (action === 'close') {
    status = 'closed';
    await env.DB.prepare("UPDATE threads SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?")
      .bind(ts, ts, threadId).run();
  } else {
    status = 'open';
    await env.DB.prepare("UPDATE threads SET status = 'open', closed_at = NULL, updated_at = ? WHERE id = ?")
      .bind(ts, threadId).run();
  }

  return json({ ok: true, thread_id: threadId, status });
};
