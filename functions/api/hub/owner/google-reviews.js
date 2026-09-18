// Disconnected Google reviews workspace. Draft storage only; no external actions.
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { GOOGLE_REVIEW_CAPABILITIES, validateReviewDraft } from '../../../_lib/google_review_drafts.js';
const TABLE = 'google_review_drafts';
const response = (body, status = 200) => {
  const r = json({ ...GOOGLE_REVIEW_CAPABILITIES, ...body }, status);
  r.headers.set('Cache-Control','no-store'); return r;
};
export const onRequestGet = async ({ request, env }) => {
  const actor = await requireRole(request, env, MARKETING_DESK); if (actor instanceof Response) return actor;
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM ${TABLE} ORDER BY updated_at DESC, id DESC LIMIT 100`).all();
    return response({ ok: true, storage: 'available', drafts: results || [], list_scope: 'latest_100_local_drafts' });
  } catch { return response({ ok: false, storage: 'unavailable', error: 'Private draft storage is unavailable. Verify migration 0116 before using this workspace.' },503); }
};
export const onRequestPost = async ({ request, env }) => {
  const actor = await requireRole(request, env, MARKETING_DESK); if (actor instanceof Response) return actor;
  let body;
  try { const raw = await request.text(); if (raw.length > 16000) return bad('Draft request is too large.',413); body = JSON.parse(raw); }
  catch { return bad('Send a valid JSON draft.'); }
  const parsed = validateReviewDraft(body); if (parsed.error) return bad(parsed.error);
  const b = parsed.value, author = actor.distinct_id || actor.email, at = Date.now();
  try {
    let draftId = b.id;
    if (b.op === 'create') {
      draftId = id('grd');
      await env.DB.prepare(`INSERT INTO ${TABLE} (id,request_id,review_text,rating,source_url,proposed_reply,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING`)
        .bind(draftId,b.request_id,b.review_text,b.rating,b.source_url,b.proposed_reply,author,author,at,at).run();
      const draft = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE request_id=?`).bind(b.request_id).first();
      if (!draft || draft.created_by !== author || draft.review_text !== b.review_text || draft.rating !== b.rating || draft.source_url !== b.source_url || draft.proposed_reply !== b.proposed_reply || draft.status !== 'draft') return response({ok:false,error:'This request_id already belongs to different draft content. Refresh before retrying.'},409);
      return response({ok:true,storage:'available',draft});
    }
    const result = b.op === 'dismiss'
      ? await env.DB.prepare(`UPDATE ${TABLE} SET status='dismissed',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND status='draft'`).bind(author,at,b.id,b.version).run()
      : await env.DB.prepare(`UPDATE ${TABLE} SET review_text=?,rating=?,source_url=?,proposed_reply=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND status='draft'`).bind(b.review_text,b.rating,b.source_url,b.proposed_reply,author,at,b.id,b.version).run();
    if (!result.meta?.changes) return response({ok:false,error:'Draft changed, was dismissed, or is unavailable. Reload before editing.'},409);
    return response({ok:true,storage:'available',draft:await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE id=?`).bind(draftId).first()});
  } catch { return response({ok:false,storage:'unavailable',error:'Could not save the private draft. Nothing was sent to Google. Retry with the same request_id after storage recovers.'},503); }
};
