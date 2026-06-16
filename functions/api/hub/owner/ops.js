// GET /api/hub/owner/ops — the latest Añejo Ops demand forecast (next-day + week) and the
// kitchen prep sheet. Read-only; owner + kitchen (the kitchen needs the prep sheet).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { parseJson } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner', 'kitchen']);
  if (ctx instanceof Response) return ctx;

  let nextDay = null, week = null, prep = null, accuracy = [], reports = [];
  try { nextDay = await env.DB.prepare("SELECT * FROM forecasts WHERE horizon='next_day' ORDER BY generated_at DESC LIMIT 1").first(); } catch { /* none yet */ }
  try { week = await env.DB.prepare("SELECT * FROM forecasts WHERE horizon='week' ORDER BY generated_at DESC LIMIT 1").first(); } catch { /* none */ }
  try { prep = await env.DB.prepare("SELECT * FROM prep_plans WHERE horizon='next_day' ORDER BY generated_at DESC LIMIT 1").first(); } catch { /* none */ }
  try { accuracy = ((await env.DB.prepare('SELECT forecast_date, predicted_total, actual_total, pct_error FROM forecast_accuracy ORDER BY forecast_date DESC LIMIT 14').all()).results) || []; } catch { accuracy = []; }
  try { reports = ((await env.DB.prepare('SELECT report_type, report_date, title, body, generated_at FROM ops_reports ORDER BY generated_at DESC LIMIT 8').all()).results) || []; } catch { reports = []; }

  const fmtF = (f) => f ? { ...f, bowl_mix: parseJson(f.bowl_mix, {}) } : null;
  return json({
    ok: true,
    next_day: fmtF(nextDay),
    week: fmtF(week),
    prep_plan: prep ? { ...prep, bowl_counts: parseJson(prep.bowl_counts, {}) } : null,
    accuracy,
    reports,
  });
};
