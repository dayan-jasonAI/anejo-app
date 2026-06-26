// POST /api/hub/kitchen/studio/brief-proposal — draft or submit a PROPOSED change to the Brand &
// Standards Brief from the Creative Studio. Kitchen + owner may propose; NOTHING changes until an
// owner approves it via /api/hub/owner/brief-proposals. This endpoint can never commit a change.
//   ?ai_draft=1  → { ok, draft:{title,rationale,proposed_body}, demo }   (not persisted)
//   (default)    → { ok, proposal }  body: { session_id?, title, rationale?, proposed_body }
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { draftBriefChange, createProposal, BRAND_DOC_ID } from '../../../../_lib/brief.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = (b && b.session_id || '').toString().trim() || null;
  const wantDraft = new URL(request.url).searchParams.get('ai_draft') === '1' || !!(b && b.ai_draft);

  if (wantDraft) {
    const draft = await draftBriefChange(env, { sessionId, instruction: (b && b.instruction) || '' });
    if (!draft) return bad('Could not draft a Brief change. Please try again.', 502);
    return json({ ok: true, demo: !!draft.demo, draft });
  }

  const proposed_body = (b && b.proposed_body || '').toString();
  if (!proposed_body.trim()) return bad('A proposed Brief body is required.');
  const proposal = await createProposal(env, {
    docId: BRAND_DOC_ID,
    sessionId,
    staff,
    role: ctx.role,
    title: b && b.title,
    rationale: b && b.rationale,
    proposed_body,
  });
  if (!proposal) return bad('Could not save the proposal.', 500);

  await capture(env, {
    event: 'brief_proposal.created',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { proposal_id: proposal.id, session_id: sessionId },
  });
  return json({ ok: true, proposal });
};
