// GET /api/hub/owner/traffic — first-party analytics summary (owner-only). Reads page_views.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = Date.now() - days * 86400000;
  const q = async (sql) => ((await env.DB.prepare(sql).bind(since).all()).results) || [];
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM page_views WHERE created_at>?').bind(since).first()).n;
  return json({
    ok: true, days, total,
    by_path:   await q('SELECT path, COUNT(*) AS n FROM page_views WHERE created_at>? GROUP BY path ORDER BY n DESC LIMIT 30'),
    by_source: await q('SELECT ref_source, COUNT(*) AS n FROM page_views WHERE created_at>? GROUP BY ref_source ORDER BY n DESC'),
    by_lang:   await q("SELECT lang, COUNT(*) AS n FROM page_views WHERE created_at>? GROUP BY lang ORDER BY n DESC"),
    by_country:await q('SELECT country, COUNT(*) AS n FROM page_views WHERE created_at>? GROUP BY country ORDER BY n DESC LIMIT 12'),
    organic:   await q("SELECT ref_host, COUNT(*) AS n FROM page_views WHERE created_at>? AND ref_source='organic' GROUP BY ref_host ORDER BY n DESC LIMIT 10"),
  });
};
