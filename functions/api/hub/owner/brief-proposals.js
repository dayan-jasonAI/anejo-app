// /api/hub/owner/brief-proposals — OWNER-ONLY review of proposed Brand & Standards Brief changes.
// This is the ONLY place a Brief change can be committed, and it is gated to the owner role — so a
// kitchen user (or a chat "Dayan approved it") can never make a change official.
//   GET  ?status=pending|approved|rejected|all   → proposals newest first
//   POST { id, decision:'approve'|'reject', note? }
//        approve → snapshots the prior Brief body (rollback) + overwrites doc_brand_main (version+1)
//                  so every future Studio session is grounded on it; reject → marks it rejected.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { listProposals, decideProposal } from '../../../_lib/brief.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const status = (new URL(request.url).searchParams.get('status') || 'pending').toLowerCase();
  const items = await listProposals(env, status === 'all' ? null : status);
  return json({ ok: true, items });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);   // ← the enforcement: owner only
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const owner = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const id = (b && b.id || '').toString().trim();
  const decision = b && b.decision;
  if (!id) return bad('Missing proposal id.');
  if (!['approve', 'reject', 'needs_info'].includes(decision)) return bad("decision must be 'approve', 'reject', or 'needs_info'.");

  const res = await decideProposal(env, { id, decision, owner, role: ctx.role, note: b && b.note });
  if (res.error) return bad(res.error, 409);

  await capture(env, {
    event: 'brief_proposal.' + res.status,   // brief_proposal.approved | brief_proposal.rejected
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { proposal_id: id },
  });
  return json({ ok: true, status: res.status });
};
