// GET /api/hub/kitchen/catering — kitchen-safe Cajita production view.
// Deliberately excludes customer contact fields; owner desk retains the full request.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { extractCajitaConfiguration } from '../../../_lib/cajita-config.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  let rows;
  try {
    const result = await env.DB.prepare(
      `SELECT id, event_date, guests, interest, message, created_at
         FROM leads WHERE kind='catering' ORDER BY created_at DESC LIMIT 50`
    ).all();
    rows = (result && result.results) || [];
  } catch { return bad('Could not load catering production requests.', 500); }
  return json({ ok: true, requests: rows.map((row) => {
    const parsed = extractCajitaConfiguration(row.message);
    return {
      id: row.id, event_date: row.event_date || null, guests: row.guests || null,
      interest: row.interest || null, created_at: row.created_at,
      cajita_configuration: parsed ? parsed.config : null,
      cajita_summary: parsed ? parsed.summary : null,
    };
  }) });
};
