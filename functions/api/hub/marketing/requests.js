// /api/hub/marketing/requests — system improvement / update requests, as a TRACKED object.
//   GET  [?status=open|decided|all]     → the list, newest first
//   POST { op:'file', kind, title, body?, area? }        → she files one (marketing desk)
//   POST { op:'decide', id, status, note? }              → the OWNER decides (owner only)
//
// WHY THIS IS NOT AN ALERT. Findings and requests are different objects with different lifetimes.
// A finding ("the bio link is dead") is read once, acted on, and acknowledged — an alert is
// exactly right. A request ("we should be able to schedule Stories") has no natural end: it is
// open until somebody decides, and the person who filed it needs to see THAT it was decided.
// Sharing the alert feed meant every request was acknowledged into silence, which teaches the
// person filing them to stop.
//
// DECLINING IS A FIRST-CLASS OUTCOME. 'declined' with a reason is a served request; the failure
// mode this route exists to prevent is the unanswered one.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK, currentStaff } from '../../../_lib/roles.js';
import { id as genId, now } from '../../../_lib/hub.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { capture } from '../../../_lib/track.js';

export const REQUEST_KINDS = ['improvement', 'bug', 'question'];
export const REQUEST_STATUSES = ['open', 'accepted', 'declined', 'shipped'];

const MAX_TITLE = 160;
const MAX_BODY = 4000;
const MAX_NOTE = 2000;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const want = (new URL(request.url).searchParams.get('status') || 'all').toLowerCase();
  let where = '';
  if (want === 'open') where = "WHERE status = 'open'";
  else if (want === 'decided') where = "WHERE status <> 'open'";

  let items = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, staff_id, role, kind, title, body, area, status, owner_note, decided_at, created_at, updated_at
         FROM improvement_requests ${where} ORDER BY (status='open') DESC, created_at DESC LIMIT 100`
    ).all();
    items = (r && r.results) || [];
  } catch { items = []; }   // not migrated yet — an empty list, not an error screen

  return json({
    ok: true,
    items,
    kinds: REQUEST_KINDS,
    statuses: REQUEST_STATUSES,
    open_count: items.filter((i) => i.status === 'open').length,
    can_decide: ctx.role === 'owner',
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON.'); }
  const op = String((b && b.op) || '');
  const t = now();

  if (op === 'file') {
    const title = String(b.title || '').trim().slice(0, MAX_TITLE);
    if (!title) return bad('Give it a title.');
    const kind = REQUEST_KINDS.includes(b.kind) ? b.kind : 'improvement';
    const body = String(b.body || '').trim().slice(0, MAX_BODY) || null;
    const area = String(b.area || '').trim().slice(0, 80) || null;

    const staff = await currentStaff(env, request);
    const rid = genId('req');
    try {
      await env.DB.prepare(
        `INSERT INTO improvement_requests (id, staff_id, role, kind, title, body, area, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,'open',?,?)`
      ).bind(rid, (staff && staff.id) || ctx.distinct_id || null, ctx.role, kind, title, body, area, t, t).run();
    } catch { return bad('Could not file that — the requests table is not set up yet.', 500); }

    // He is still TOLD, through the feed he already reads — the request just no longer LIVES
    // there. A bug reported as a request is a warning; an idea is an FYI.
    await raiseAlert(env, {
      alert_type: 'improvement_request',
      severity: kind === 'bug' ? 'warning' : 'info',
      title: `${kind === 'bug' ? 'Bug' : kind === 'question' ? 'Question' : 'Request'}: ${title}`,
      body: body || 'Open the marketing desk to read it.',
      team: 'marketing',
      source: 'marketing_desk',
      ref_type: 'improvement_request',
      ref_id: rid,
    });

    await capture(env, {
      event: 'marketing.request_filed',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { kind },
    });
    return json({ ok: true, id: rid });
  }

  if (op === 'decide') {
    // Deciding is the OWNER's, inside an endpoint the desk shares. She files and reads; he rules.
    // Without this she could mark her own request 'accepted' and the status would mean nothing.
    if (ctx.role !== 'owner') return bad('Only the owner decides a request.', 403);

    const rid = String(b.id || '').trim();
    const status = String(b.status || '').trim();
    if (!rid) return bad('Which request?');
    if (!REQUEST_STATUSES.includes(status) || status === 'open') {
      return bad('Decide it: accepted, declined or shipped.');
    }
    const note = String(b.note || '').trim().slice(0, MAX_NOTE) || null;

    let r;
    try {
      r = await env.DB.prepare(
        'UPDATE improvement_requests SET status=?, owner_note=?, decided_at=?, decided_by=?, updated_at=? WHERE id=?'
      ).bind(status, note, t, ctx.distinct_id || ctx.email || null, t, rid).run();
    } catch { return bad('Could not save that decision.', 500); }
    if (!r || !r.meta || r.meta.changes !== 1) return bad('Request not found.', 404);

    await capture(env, {
      event: 'marketing.request_decided',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { status },
    });
    return json({ ok: true, id: rid, status });
  }

  return bad('Unknown op.');
};
