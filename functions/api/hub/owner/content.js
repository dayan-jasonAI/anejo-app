// /api/hub/owner/content — owner-only authoring for the docs library
// (manuals / policies / procedures / recipes).
//   GET  ?type=&q=        → list (no bodies; body_len), newest first, archived included + flagged
//   GET  ?id=doc_xxx      → single full doc (for edit-in-place)
//   POST { action:'create',  doc_type, title, body?, role_scope? }
//   POST { action:'update',  id, title?, body?, role_scope? }   (bumps version)
//   POST { action:'archive'|'restore', id }
// "Remove" is always a soft archive (active=0) — rows are NEVER deleted.
// Reads by staff fire doc.viewed elsewhere (kitchen/docs); authoring is not tracked.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { id as genId, now, parseJson, toJson } from '../../../_lib/hub.js';

const DOC_TYPES = ['manual', 'policy', 'procedure', 'recipe'];
const SCOPE_ROLES = ['owner', 'kitchen', 'driver', 'vendor'];

// Normalize a role_scope payload → array of known roles, or null (= visible to all staff).
function cleanScope(v) {
  if (!Array.isArray(v)) return null;
  const roles = v.map((r) => String(r)).filter((r) => SCOPE_ROLES.includes(r));
  return roles.length ? roles : null;
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const docId = (url.searchParams.get('id') || '').trim();

  // Single full doc for the editor panel.
  if (docId) {
    const doc = await env.DB.prepare('SELECT * FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);
    return json({
      ok: true,
      doc: {
        id: doc.id, doc_type: doc.doc_type, title: doc.title, body: doc.body || '',
        recipe_id: doc.recipe_id, role_scope: parseJson(doc.role_scope, null),
        version: doc.version, active: doc.active,
        created_at: doc.created_at, updated_at: doc.updated_at,
      },
    });
  }

  // Library index — newest first, archived rows included and flagged via `active`.
  const type = (url.searchParams.get('type') || '').trim();
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  let stmt;
  const cols =
    "SELECT id, doc_type, title, recipe_id, role_scope, version, active, updated_at, LENGTH(COALESCE(body,'')) AS body_len FROM docs";
  if (type && DOC_TYPES.includes(type)) {
    stmt = env.DB.prepare(`${cols} WHERE doc_type = ? ORDER BY updated_at DESC`).bind(type);
  } else {
    stmt = env.DB.prepare(`${cols} ORDER BY updated_at DESC`);
  }
  const { results } = await stmt.all();

  const docs = (results || [])
    .filter((d) => !q || (d.title || '').toLowerCase().includes(q))
    .map((d) => ({
      id: d.id, doc_type: d.doc_type, title: d.title, recipe_id: d.recipe_id,
      role_scope: parseJson(d.role_scope, null), version: d.version,
      active: d.active, updated_at: d.updated_at, body_len: d.body_len,
    }));

  return json({ ok: true, docs });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = (b && b.action || '').toString().trim();
  const ts = now();

  if (action === 'create') {
    const doc_type = (b.doc_type || '').toString().trim();
    if (!DOC_TYPES.includes(doc_type)) return bad('Invalid doc_type.');
    const title = (b.title || '').toString().trim();
    if (!title) return bad('Title is required.');
    const body = b.body == null ? null : String(b.body);
    const scope = cleanScope(b.role_scope);

    const docId = genId('doc');
    await env.DB
      .prepare(
        'INSERT INTO docs (id, doc_type, title, body, role_scope, version, active, created_by, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)'
      )
      .bind(docId, doc_type, title, body, toJson(scope), ctx.distinct_id || null, ts, ts)
      .run();
    return json({ ok: true, id: docId, version: 1 });
  }

  if (action === 'update') {
    const docId = (b.id || '').toString().trim();
    if (!docId) return bad('Missing doc id.');
    const doc = await env.DB.prepare('SELECT id, version FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);

    const sets = [];
    const args = [];
    if (b.title !== undefined) {
      const title = (b.title || '').toString().trim();
      if (!title) return bad('Title cannot be empty.');
      sets.push('title=?'); args.push(title);
    }
    if (b.body !== undefined) { sets.push('body=?'); args.push(b.body == null ? null : String(b.body)); }
    if (b.role_scope !== undefined) { sets.push('role_scope=?'); args.push(toJson(cleanScope(b.role_scope))); }
    if (!sets.length) return bad('Nothing to update.');

    sets.push('version=version+1');
    sets.push('updated_at=?'); args.push(ts);
    args.push(docId);
    await env.DB.prepare(`UPDATE docs SET ${sets.join(', ')} WHERE id=?`).bind(...args).run();
    return json({ ok: true, id: docId, version: (doc.version || 1) + 1 });
  }

  if (action === 'archive' || action === 'restore') {
    const docId = (b.id || '').toString().trim();
    if (!docId) return bad('Missing doc id.');
    const doc = await env.DB.prepare('SELECT id FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);
    // Soft archive only — never DELETE.
    await env.DB
      .prepare('UPDATE docs SET active=?, updated_at=? WHERE id=?')
      .bind(action === 'archive' ? 0 : 1, ts, docId)
      .run();
    return json({ ok: true, id: docId, active: action === 'archive' ? 0 : 1 });
  }

  return bad('Unknown action.');
};
