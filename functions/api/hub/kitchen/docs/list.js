// GET /api/hub/kitchen/docs/list?q=&type= — role-scoped, searchable library index.
// Returns active docs the current role may view (role_scope is a JSON array of roles;
// null/empty = all staff). Does NOT return doc bodies — use docs/get for a single read.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { parseJson } from '../../../../_lib/hub.js';
import { requestedReadingLocale, documentListReadingEdition, isLocalizedDocSearchMatch } from '../../../../_lib/localized_operating_content.js';

const DOC_TYPES = ['manual', 'policy', 'procedure', 'recipe'];

function visibleTo(doc, role) {
  const scope = parseJson(doc.role_scope, null);
  if (!Array.isArray(scope) || scope.length === 0) return true;
  return scope.includes(role) || role === 'owner';
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const type = url.searchParams.get('type');
  const locale = requestedReadingLocale(request);

  let stmt;
  if (type && DOC_TYPES.includes(type)) {
    stmt = env.DB.prepare(
      'SELECT id, doc_type, title, body, recipe_id, role_scope, version, updated_at FROM docs WHERE active = 1 AND doc_type = ? ORDER BY doc_type, title'
    ).bind(type);
  } else {
    stmt = env.DB.prepare(
      'SELECT id, doc_type, title, body, recipe_id, role_scope, version, updated_at FROM docs WHERE active = 1 ORDER BY doc_type, title'
    );
  }
  const { results } = await stmt.all();

  const docs = [];
  for (const d of results || []) {
    if (!visibleTo(d, ctx.role)) continue;
    const localized = locale === 'es' ? await documentListReadingEdition(env, d, locale) : null;
    const englishMatch = !q || (d.title || '').toLowerCase().includes(q);
    const spanishMatch = isLocalizedDocSearchMatch(localized, q);
    if (!englishMatch && !spanishMatch) continue;
    docs.push({
      id: d.id, doc_type: d.doc_type, title: localized?.title || d.title,
      recipe_id: d.recipe_id, version: d.version, updated_at: d.updated_at,
      ...(localized ? { source_title: localized.source_title } : {}),
      ...(localized ? { localization: localized.localization } : {}),
    });
  }

  return json({ docs });
};
