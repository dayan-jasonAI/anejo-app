// /api/hub/owner/brief-proposals — OWNER-ONLY review of proposed Brand & Standards Brief changes.
// This is the ONLY place a Brief change can be committed, and it is gated to the owner role — so a
// kitchen user (or a chat "Dayan approved it") can never make a change official.
//   GET  ?status=pending|approved|rejected|all   → proposals newest first
//   GET  ?view=versions[&doc_id=]                → snapshot history for a doc (rollback targets)
//   GET  ?view=version&version_id=               → one snapshot's FULL body (read before restoring)
//   POST { id, decision:'approve'|'reject', note? }
//        approve → snapshots the prior Brief body (rollback) + overwrites doc_brand_main (version+1)
//                  so every future Studio session is grounded on it; reject → marks it rejected.
//   POST { op:'restore', version_id, doc_id? }
//        → snapshots the CURRENT body first, then puts the chosen snapshot back. Makes the "prior
//          version is reversible" promise on brief-proposals.html actually true.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { listProposals, decideProposal, listDocVersions, getDocVersion, restoreDocVersion, getDoc, BRAND_DOC_ID } from '../../../_lib/brief.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const params = new URL(request.url).searchParams;
  const view = (params.get('view') || 'proposals').toLowerCase();

  // Snapshot history for the Brief, plus where the live doc stands, so the owner can tell which
  // version is currently in force before rolling anything back.
  if (view === 'versions') {
    const docId = (params.get('doc_id') || BRAND_DOC_ID).trim() || BRAND_DOC_ID;
    const doc = await getDoc(env, docId);
    return json({
      ok: true,
      doc_id: docId,
      doc: doc ? { id: doc.id, title: doc.title, version: doc.version, body_chars: (doc.body || '').length } : null,
      versions: await listDocVersions(env, docId),
    });
  }

  if (view === 'version') {
    const vid = (params.get('version_id') || '').trim();
    if (!vid) return bad('Missing version_id.');
    const v = await getDocVersion(env, vid);
    if (!v) return bad('Version not found.', 404);
    return json({ ok: true, version: v });
  }

  const status = (params.get('status') || 'pending').toLowerCase();
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

  // Roll the Brief back to an earlier snapshot. Same owner gate as approving — it overwrites the
  // live Brief the same way — and the current body is snapshotted first, so this is reversible too.
  if (b && b.op === 'restore') {
    const versionId = (b.version_id || '').toString().trim();
    if (!versionId) return bad('Missing version_id.');
    const res = await restoreDocVersion(env, {
      versionId,
      docId: (b.doc_id || '').toString().trim() || null,
      owner, role: ctx.role,
    });
    if (res.error) return bad(res.error, 409);
    await capture(env, {
      event: 'brief_version.restored',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { doc_id: res.doc_id, version_id: versionId },
    });
    return json({ ok: true, doc_id: res.doc_id, version: res.version });
  }

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
