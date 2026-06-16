// POST /api/hub/admin/ops-report?type=eod_lunch|eod_dinner|daily_standup|weekly_summary|insights|morning_briefing
//   Generates one Añejo Ops report. Auth: owner session OR X-Cron-Key. The cron worker calls
//   it at the right times (after lunch, after dinner, Sundays); the owner can run any on demand.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { generateReport } from '../../../_lib/ops.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  const url = new URL(request.url);
  let type = url.searchParams.get('type') || '';
  if (!type) { try { const b = await request.json(); type = (b && b.type) || ''; } catch { /* no body */ } }
  if (!type) return bad('Missing report type.');

  const r = await generateReport(env, type, {});
  if (!r || !r.ok) return bad((r && r.reason) || 'Could not generate report.', 422);
  return json(r);
};
