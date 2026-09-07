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
      `SELECT l.id, l.interest, l.message, l.created_at, r.event_json
         FROM leads l LEFT JOIN catering_requests r ON r.lead_id=l.id
         WHERE l.kind='catering' ORDER BY l.created_at DESC LIMIT 50`
    ).all();
    rows = (result && result.results) || [];
  } catch { return bad('Could not load catering production requests.', 500); }
  return json({ ok: true, requests: rows.map((row) => {
    let event = null;
    try { event = row.event_json ? JSON.parse(row.event_json) : null; } catch { event = null; }
    const field = (label) => { const match = String(row.message || '').split('\n').find((line) => line.startsWith(`${label}:`)); return match ? match.slice(label.length + 1).trim() : null; };
    const parsed = extractCajitaConfiguration(row.message);
    return {
      id: row.id, event_date: event?.event_date || field('Event date'), serving_time: event?.event_time || field('Serving time'), guests: event?.guests || Number(field('Guest count')) || null,
      location: null, dietary_needs: event?.dietary_needs || field('Dietary needs / allergies'), event_details: event?.event_details || null,
      interest: row.interest || null, created_at: row.created_at,
      cajita_configuration: parsed ? parsed.config : null,
      cajita_summary: parsed ? parsed.summary : null,
    };
  }) });
};
