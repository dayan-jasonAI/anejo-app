// /api/hub/owner/expenses — owner expense review queue.
//   GET  ?status=pending|all          → expenses with the submitter's name, newest first
//   POST { id, decision:'approved'|'rejected', note? }
//        → updates status/reviewed_by/reviewed_at (+appends an 'Owner: …' note),
//          fires expense.reviewed, closes the matching expense_pending alert, and
//          posts an in_app message to the staffer's thread so they see the outcome.
// Owner-only.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

// Find the staffer's latest open thread, or create one (audience = their role).
// Prefers a threads.staff_id column when present (added by the comms module);
// falls back to created_by so this works against the base 0003 schema too.
async function findOrCreateStaffThread(env, staff, subject, t) {
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE staff_id=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(staff.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* no staff_id column yet */ }
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE created_by=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(staff.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* tolerate */ }

  const tid = id('thr');
  try {
    await env.DB
      .prepare("INSERT INTO threads (id, audience, subject, created_by, staff_id, status, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?)")
      .bind(tid, staff.role || 'kitchen', subject, staff.id, staff.id, t, t)
      .run();
    return tid;
  } catch { /* no staff_id column yet */ }
  await env.DB
    .prepare("INSERT INTO threads (id, audience, subject, created_by, status, created_at, updated_at) VALUES (?,?,?,?,'open',?,?)")
    .bind(tid, staff.role || 'kitchen', subject, staff.id, t, t)
    .run();
  return tid;
}

// Post an in_app message into a thread (and bump last_message_at). Best-effort.
async function postInApp(env, ctx, threadId, body, audience, t) {
  try {
    await env.DB
      .prepare("INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,'outbound','in_app',?,?,?,0,?)")
      .bind(id('msg'), threadId, ctx.distinct_id || null, ctx.role || 'owner', body, t)
      .run();
    await env.DB
      .prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?')
      .bind(t, t, threadId)
      .run();
    await capture(env, {
      event: 'message.sent',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { channel: 'in_app', audience, ai_drafted: false },
    });
  } catch { /* messaging must not break the review */ }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'pending').toLowerCase();
  const where = status === 'all' ? '' : "WHERE e.status='pending'";

  let rows = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT e.id, e.staff_id, e.expense_type, e.amount_cents, e.receipt_photo, e.note, e.status, ' +
        'e.reviewed_by, e.reviewed_at, e.created_at, s.name AS staff_name, s.role AS staff_role ' +
        `FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id ${where} ORDER BY e.created_at DESC LIMIT 200`
      )
      .all();
    rows = (res && res.results) || [];
  } catch {
    rows = [];
  }
  return json({ ok: true, items: rows, count: rows.length });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const expId = (b && b.id || '').toString().trim();
  const decision = (b && b.decision || '').toString();
  const note = (b && b.note || '').toString().trim();
  if (!expId) return bad('Missing expense id.');
  if (decision !== 'approved' && decision !== 'rejected') return bad("Decision must be 'approved' or 'rejected'.");

  const exp = await env.DB.prepare('SELECT * FROM expenses WHERE id=?').bind(expId).first();
  if (!exp) return json({ error: 'Expense not found.' }, 404);
  if (exp.status !== 'pending') return bad('This expense was already reviewed.', 409);

  const t = now();
  const mergedNote = note ? (exp.note ? `${exp.note}\nOwner: ${note}` : `Owner: ${note}`) : exp.note;
  await env.DB
    .prepare('UPDATE expenses SET status=?, reviewed_by=?, reviewed_at=?, note=?, updated_at=? WHERE id=?')
    .bind(decision, ctx.distinct_id || null, t, mergedNote || null, t, expId)
    .run();

  await capture(env, {
    event: 'expense.reviewed',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { decision, amount_cents: exp.amount_cents, expense_id: expId },
  });

  // Close the matching expense_pending alert (raised by automations) by dedupe key.
  try {
    await env.DB
      .prepare("UPDATE alerts SET status='acknowledged', acknowledged_by=?, acknowledged_at=?, updated_at=? WHERE dedupe_key=? AND status='open'")
      .bind(ctx.distinct_id || null, t, t, `expense_pending:${expId}`)
      .run();
  } catch { /* best-effort */ }

  // Tell the staffer in their thread.
  const staff = await env.DB.prepare('SELECT id, name, role FROM staff WHERE id=?').bind(exp.staff_id).first();
  if (staff) {
    const amount = `$${((exp.amount_cents || 0) / 100).toFixed(2)}`;
    const verdict = decision === 'approved' ? 'approved' : 'rejected';
    let body = `Your ${amount} expense was ${verdict}.`;
    if (note) body += ` Note: ${note}`;
    const threadId = await findOrCreateStaffThread(env, staff, 'Expense update', t).catch(() => null);
    if (threadId) await postInApp(env, ctx, threadId, body, staff.role || 'kitchen', t);
  }

  return json({ ok: true, id: expId, status: decision });
};
