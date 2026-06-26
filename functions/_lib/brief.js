// Owner-approved Brief change pipeline (see migrations/0034). The Studio can DRAFT and PROPOSE a
// change to the Brand & Standards Brief; nothing changes until an OWNER approves it (the approve
// path is only reachable from an owner-gated endpoint). On approval we snapshot the prior body for
// rollback, then overwrite the brand doc so buildBrandContext grounds every future session on it.
// Files under _lib are NOT routed.
import { id, now, parseJson } from './hub.js';
import { buildBrandContext } from './studio_context.js';

const MODEL = 'claude-sonnet-4-6';
export const BRAND_DOC_ID = 'doc_brand_main';
const MAX_BODY = 60000;

export async function getDoc(env, docId) {
  try {
    return await env.DB.prepare('SELECT id, doc_type, title, body, role_scope, version FROM docs WHERE id = ?').bind(docId).first();
  } catch { return null; }
}

// Ask the model to produce a COMPLETE revised Brief that preserves everything verbatim except the
// requested change. Owner reviews the full proposed body before it can be committed. Bilingual for
// any newly-added content. Returns { title, rationale, proposed_body, demo }.
export async function draftBriefChange(env, { sessionId, instruction }) {
  const doc = await getDoc(env, BRAND_DOC_ID);
  const current = (doc && doc.body) || '';
  if (!env.ANTHROPIC_API_KEY) {
    return {
      demo: true,
      title: 'Demo proposal',
      rationale: 'Connect ANTHROPIC_API_KEY to draft a real Brief change.',
      proposed_body: current || 'Añejo Brand & Standards Brief (demo).',
    };
  }
  let transcript = '';
  if (sessionId) {
    try {
      const { results } = await env.DB.prepare(
        'SELECT kind, content FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 60'
      ).bind(sessionId).all();
      transcript = (results || []).map((e) => `${e.kind && e.kind.startsWith('ai') ? 'AI' : 'CHEF'}: ${e.content || ''}`).join('\n');
    } catch { /* optional */ }
  }
  const sys =
    'You revise Añejo Catering Co.\'s Brand & Standards Brief. Output the COMPLETE revised Brief, ' +
    'preserving ALL existing content verbatim EXCEPT the specific change requested — never summarize, ' +
    'drop, or reorder sections you were not asked to change. Añejo is bilingual (English + Spanish); ' +
    'write any NEWLY ADDED content in both languages. This is a PROPOSAL for the owner (Dayan) to ' +
    'review — it is not yet approved or official.\n\n' +
    'Return ONLY JSON: {"title","rationale","proposed_body"}. title = a short summary of the change; ' +
    'rationale = why; proposed_body = the full revised Brief. No markdown fences.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000, system: sys,
        messages: [{ role: 'user', content: `CURRENT BRIEF:\n${current}\n\nSESSION (context):\n${transcript}\n\nREQUESTED CHANGE:\n${instruction || '(infer from the session)'}\n\nReturn the JSON.` }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const a = text.indexOf('{'); const b = text.lastIndexOf('}');
    if (a === -1 || b === -1) return null;
    const obj = JSON.parse(text.slice(a, b + 1));
    if (!obj || !obj.proposed_body) return null;
    return { title: String(obj.title || 'Brief change').slice(0, 200), rationale: String(obj.rationale || '').slice(0, 1000), proposed_body: String(obj.proposed_body).slice(0, MAX_BODY), demo: false };
  } catch { return null; }
}

export async function createProposal(env, { docId, sessionId, staff, role, title, rationale, proposed_body }) {
  const pid = id('bprop');
  const t = now();
  const body = String(proposed_body || '').slice(0, MAX_BODY);
  if (!body.trim()) return null;
  try {
    await env.DB.prepare(
      `INSERT INTO brief_proposals (id, doc_id, session_id, proposed_by, proposed_role, title, rationale, proposed_body, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)`
    ).bind(
      pid, docId || BRAND_DOC_ID, sessionId || null, staff ? staff.id : null, role || null,
      String(title || 'Brief change').slice(0, 200), rationale ? String(rationale).slice(0, 1000) : null, body, t, t
    ).run();
    return await env.DB.prepare('SELECT id, doc_id, title, rationale, status, created_at FROM brief_proposals WHERE id = ?').bind(pid).first();
  } catch { return null; }
}

export async function listProposals(env, status) {
  let q = 'SELECT bp.id, bp.doc_id, bp.session_id, bp.proposed_by, bp.proposed_role, bp.title, bp.rationale, bp.proposed_body, bp.status, bp.decided_by, bp.decided_at, bp.decision_note, bp.created_at, st.name AS proposed_name FROM brief_proposals bp LEFT JOIN staff st ON st.id = bp.proposed_by';
  const binds = [];
  if (['pending', 'approved', 'rejected', 'needs_info'].includes(status)) { q += ' WHERE bp.status = ?'; binds.push(status); }
  q += ' ORDER BY bp.created_at DESC LIMIT 100';
  try { const r = await env.DB.prepare(q).bind(...binds).all(); return (r && r.results) || []; } catch { return []; }
}

// A staffer's own proposals + the owner's decision/note — so they get feedback on what they submitted.
export async function listMyProposals(env, staffId) {
  try {
    const r = await env.DB.prepare(
      'SELECT id, title, rationale, status, decision_note, decided_at, created_at FROM brief_proposals WHERE proposed_by = ? ORDER BY created_at DESC LIMIT 30'
    ).bind(staffId || '').all();
    return (r && r.results) || [];
  } catch { return []; }
}

// OWNER-ONLY (enforce requireRole(['owner']) in the calling endpoint). Approve = snapshot prior
// body → overwrite the brand doc (version+1). Reject = mark rejected. Idempotent on non-pending.
export async function decideProposal(env, { id: propId, decision, owner, note }) {
  const p = await env.DB.prepare('SELECT * FROM brief_proposals WHERE id = ?').bind(propId).first();
  if (!p) return { error: 'Proposal not found.' };
  if (p.status !== 'pending') return { error: `Already ${p.status}.` };
  const t = now();
  const ownerId = owner ? owner.id : null;

  // Reject or send back for more info: record the owner's note (visible to the staffer) WITHOUT
  // touching the Brief. 'needs_info' = the owner wants changes/clarification before deciding.
  if (decision === 'reject' || decision === 'needs_info') {
    const status = decision === 'reject' ? 'rejected' : 'needs_info';
    await env.DB.prepare('UPDATE brief_proposals SET status=?, decided_by=?, decided_at=?, decision_note=?, updated_at=? WHERE id=?')
      .bind(status, ownerId, t, note ? String(note).slice(0, 500) : null, t, propId).run();
    return { ok: true, status };
  }
  if (decision !== 'approve') return { error: 'Unknown decision.' };

  const doc = await getDoc(env, p.doc_id);
  if (doc) {
    // snapshot the prior body for rollback, then overwrite + bump version.
    await env.DB.prepare('INSERT INTO doc_versions (id, doc_id, version, body, replaced_by, from_proposal, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id('dver'), p.doc_id, doc.version || 1, doc.body || '', ownerId, propId, t).run();
    await env.DB.prepare('UPDATE docs SET body=?, version=version+1, updated_at=? WHERE id=?')
      .bind(p.proposed_body, t, p.doc_id).run();
  } else {
    // brand doc doesn't exist yet — create it (active, kitchen+owner visible).
    await env.DB.prepare(
      "INSERT INTO docs (id, doc_type, title, body, role_scope, version, active, created_at, updated_at) VALUES (?, 'brand', ?, ?, ?, 1, 1, ?, ?)"
    ).bind(p.doc_id, p.title || 'Brand & Standards Brief', p.proposed_body, JSON.stringify(['kitchen', 'owner']), t, t).run();
  }
  await env.DB.prepare('UPDATE brief_proposals SET status=?, decided_by=?, decided_at=?, decision_note=?, updated_at=? WHERE id=?')
    .bind('approved', ownerId, t, note ? String(note).slice(0, 500) : null, t, propId).run();
  return { ok: true, status: 'approved' };
}

// Tiny helper so endpoints can confirm the brand doc exists / is grounded.
export async function briefContextPresent(env) {
  try { return !!(await buildBrandContext(env)); } catch { return false; }
}

export { parseJson };
